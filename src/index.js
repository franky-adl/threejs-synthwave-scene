// ThreeJS and Third-party deps
import * as THREE from "three"
import * as dat from 'dat.gui'
import Stats from "three/examples/jsm/libs/stats.module"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass"
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial"
import { Line2 } from "three/examples/jsm/lines/Line2"

// Core boilerplate code deps
import { createCamera, createComposer, createRenderer, runApp, getDefaultUniforms } from "./core-utils"

import { loadImage, hexToRgb } from "./common-utils"
import { loadSceneBackground, getZFromImageDataPoint, vertexShader, fragmentShader } from "./functions"
import Background from "./assets/Starfield.png"
import HeightMap from "./assets/heightmap.png"

global.THREE = THREE

/**************************************************
 * 0. Tweakable parameters for the scene
 *************************************************/
const params = {
  // general scene params
  speed: 2.5,
  dirLightColor1: 0x2dd7ff,
  dirLightColor2: 0x2dd7ff,
  // bloom params
  bloomStrength: 0.5,
  bloomRadius: 0.2,
  bloomThreshold: 0.5,
  // plane params
  metalness: 0.2,
  roughness: 0.7,
  meshColor: 0xffffff,
  meshEmissive: 0x000098,
  lineWidth: 0.04,
  lineColor: 0xcee4ff,
  // sun params
  topColor: 0xffab00,
  bottomColor: 0xff51c8
}
const terrainWidth = 30
const terrainHeight = 30
const lightPos1 = {
  x: 15,
  y: 1,
  z: 5
}
const lightIntensity1 = 0.85
const lightPos2 = {
  x: -15,
  y: 1,
  z: 5
}
const lightIntensity2 = 0.85
// need to be even number since the consecutive terrains are stitched in pairs
const numOfMeshSets = 6
const sunPos = {
  x: 0,
  y: 16,
  z: -100
}
const uniforms = {
  ...getDefaultUniforms(),
  color_main: { // sun's top color
    value: hexToRgb("#ffab00", true)
  },
  color_accent: { // sun's bottom color
    value: hexToRgb("#ff51c8", true)
  }
}

/**************************************************
 * 1. Initialize core threejs components
 *************************************************/
// Create the scene
let scene = new THREE.Scene()

// Create the renderer via 'createRenderer',
// 1st param receives additional WebGLRenderer properties
// 2nd param receives a custom callback to further configure the renderer
let renderer = createRenderer({ antialias: true, logarithmicDepthBuffer: true }, (_renderer) => {
})

// Create the camera
// Pass in fov, near, far and camera position respectively
let camera = createCamera(70, 1, 120, { x: 0, y: 0, z: 2.4 })

// The RenderPass is already created in 'createComposer'
// Post-processing with Bloom effect
let bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  params.bloomStrength,
  params.bloomRadius,
  params.bloomThreshold
);
let composer = createComposer(renderer, scene, camera, (comp) => {
  comp.addPass(bloomPass)
})

/**************************************************
 * 2. Build your scene in this threejs app
 * This app object needs to consist of at least the async initScene() function (it is async so the animate function can wait for initScene() to finish before being called)
 * initScene() is called after a basic threejs environment has been set up, you can add objects/lighting to you scene in initScene()
 * if your app needs to animate things(i.e. not static), include a updateScene(interval, elapsed) function in the app as well
 *************************************************/
let app = {
  async initScene() {
    // OrbitControls
    this.controls = new OrbitControls(camera, renderer.domElement)
    this.controls.enableDamping = true

    // Environment
    await loadSceneBackground(scene, Background)

    // Lighting
    this.dirLight1 = new THREE.DirectionalLight(params.dirLightColor1, lightIntensity1)
    this.dirLight1.position.set(lightPos1.x, lightPos1.y, lightPos1.z)
    scene.add(this.dirLight1)
    this.dirLight2 = new THREE.DirectionalLight(params.dirLightColor2, lightIntensity2)
    this.dirLight2.position.set(lightPos2.x, lightPos2.y, lightPos2.z)
    scene.add(this.dirLight2)

    // create sets of objects, for the capability to use different heightmaps for each set of plane and lines
    let planeGeometries = []
    let lineGeometries = []
    let geometryPositionsArray = []

    // we only loop twice here, although we load a single HeightMap, the trick is:
    // first loop we load the HeightMap the normal way
    // second loop we load the HeightMap data horizontally inversed
    for (let i = 0; i < 2; i++) {
      // load heightmap to a new image first, then read its color data to set the heights of our plane vertices
      // see: https://gist.github.com/jawdatls/465d82f2158e1c4ce161
      let hm_image = await loadImage(HeightMap)
      var canvas = document.createElement("canvas")
      canvas.width = hm_image.width
      canvas.height = hm_image.height
      var context = canvas.getContext("2d")
      context.drawImage(hm_image, 0, 0)
      var hm_imageData = context.getImageData(0, 0, canvas.width, canvas.height)

      // Create a PlaneGeom
      let planeGeometry = new THREE.PlaneGeometry(terrainWidth, terrainHeight, terrainWidth, terrainHeight)
      let geometryPositions = planeGeometry.getAttribute("position").array
      let geometryUVs = planeGeometry.getAttribute("uv").array

      // update each vertex position's z value according to the value we extracted from the heightmap image
      for (let index = 0; index < geometryUVs.length / 2; index++) {
        let vertexU = geometryUVs[index * 2]
        let vertexV = geometryUVs[index * 2 + 1]
        // Update the z positions according to height map, inverse heightmap horizontally for the second loop
        let terrainHeight = getZFromImageDataPoint(hm_imageData, (i == 0 ? vertexU : 1 - vertexU), vertexV, canvas.width, canvas.height)
        geometryPositions[index * 3 + 2] = terrainHeight
      }
      // skew the plane geometry
      const shearMtx = new THREE.Matrix4()
      shearMtx.makeShear(-0.5, 0, 0, 0, 0, 0)
      planeGeometry.applyMatrix4(shearMtx)

      planeGeometries.push(planeGeometry)
      geometryPositionsArray.push(geometryPositions)
    }

    // zip up the gaps between the 1st and 2nd plane geometries
    for (let index = 0; index <= terrainWidth; index++) {
      let bottomOffset = (terrainWidth + 1) * terrainHeight
      // 2nd geom's bottom row height should be synced with 1st geom's top
      geometryPositionsArray[1][(bottomOffset + index) * 3 + 2] = geometryPositionsArray[0][index * 3 + 2]
      // 1st geom's bottom row height should be synced with 2nd geom's top
      geometryPositionsArray[0][(bottomOffset + index) * 3 + 2] = geometryPositionsArray[1][index * 3 + 2]
    }

    // material for the plane geometry
    let meshMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(params.meshColor),
      emissive: new THREE.Color(params.meshEmissive),
      metalness: params.metalness,
      roughness: params.roughness,
      flatShading: true
    })

    // the grid lines, reference: https://threejs.org/examples/?q=line#webgl_lines_fat
    for (let i = 0; i < 2; i++) {
      let lineGeometry = new LineGeometry()
      let linePositions = []
      // This is a specific way to map line points to corresponding vertices of the planeGeometry
      for (let row = 0; row < terrainHeight; row++) {
        let isEvenRow = row % 2 == 0
        for (let col = (isEvenRow ? 0 : (terrainWidth - 1)); isEvenRow ? (col < terrainWidth) : (col >= 0); isEvenRow ? col++ : col--) {
          for (let point = (isEvenRow ? 0 : 3); isEvenRow ? (point < 4) : (point >= 0); isEvenRow ? point++ : point--) {
            let mappedIndex
            let rowOffset = row * (terrainWidth + 1)
            if (point < 2) {
              mappedIndex = rowOffset + col + point
            } else {
              mappedIndex = rowOffset + col + point + terrainWidth - 1
            }

            linePositions.push(geometryPositionsArray[i][mappedIndex * 3])
            linePositions.push(geometryPositionsArray[i][mappedIndex * 3 + 1])
            linePositions.push(geometryPositionsArray[i][mappedIndex * 3 + 2])
          }
        }
      }
      lineGeometry.setPositions(linePositions)

      lineGeometries.push(lineGeometry)
    }

    // the material for the grid lines
    let lineMaterial = new LineMaterial({
      color: params.lineColor,
      linewidth: params.lineWidth, // in world units with size attenuation, pixels otherwise
      alphaToCoverage: false,
      worldUnits: true // such that line width depends on world distance
    })

    this.meshGroup = []
    this.lineGroup = []
    // create multiple sets of plane and line meshes determined by numOfMeshSets
    for (let i = 0; i < numOfMeshSets; i++) {
      // create the meshes
      let mesh = new THREE.Mesh(planeGeometries[i % 2], meshMaterial)
      let line = new Line2(lineGeometries[i % 2], lineMaterial)
      line.computeLineDistances()
      // set the correct pos and rot for both the terrain and its wireframe
      mesh.position.set(0, -1.5, -terrainHeight * i)
      mesh.rotation.x -= Math.PI / 2
      line.position.set(0, -1.5, -terrainHeight * i)
      line.rotation.x -= Math.PI / 2
      // add the meshes to the scene
      scene.add(mesh)
      scene.add(line)
      this.meshGroup.push(mesh)
      this.lineGroup.push(line)
    }

    // the sun
    const sunGeom = new THREE.SphereGeometry(30, 64, 64)
    const sunMat = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: vertexShader(),
      fragmentShader: fragmentShader(),
      transparent: true
    })
    let sun = new THREE.Mesh(sunGeom, sunMat)
    sun.position.set(sunPos.x, sunPos.y, sunPos.z)
    scene.add(sun)

    // GUI controls
    const gui = new dat.GUI()

    gui.add(params, "speed", 1, 10, 0.5).name('Plane speed')
    gui.addColor(params, 'dirLightColor1').name('Dir light 1').onChange((val) => {
      this.dirLight1.color.set(val)
    })
    gui.addColor(params, 'dirLightColor2').name('Dir light 2').onChange((val) => {
      this.dirLight2.color.set(val)
    })

    let bloomFolder = gui.addFolder(`Bloom`)
    bloomFolder.add(params, "bloomStrength", 0, 3, 0.05).onChange((val) => {
      bloomPass.strength = Number(val)
    })
    bloomFolder.add(params, "bloomRadius", 0, 1, 0.05).onChange((val) => {
      bloomPass.radius = Number(val)
    })
    bloomFolder.add(params, "bloomThreshold", 0, 1, 0.05).onChange((val) => {
      bloomPass.threshold = Number(val)
    })

    let planeFolder = gui.addFolder(`Plane`)
    planeFolder.add(params, "metalness", 0, 1, 0.05).onChange((val) => {
      meshMaterial.metalness = val
    })
    planeFolder.add(params, "roughness", 0, 1, 0.05).onChange((val) => {
      meshMaterial.roughness = val
    })
    planeFolder.addColor(params, 'meshColor').name('color').onChange((val) => {
      meshMaterial.color.set(val)
    })
    planeFolder.addColor(params, 'meshEmissive').name('emissive').onChange((val) => {
      meshMaterial.emissive.set(val)
    })
    planeFolder.addColor(params, 'lineColor').name('line color').onChange((val) => {
      lineMaterial.color.set(val)
    })
    planeFolder.add(params, "lineWidth", 0, 0.1, 0.01).name('line width').onChange((val) => {
      lineMaterial.linewidth = val
    })

    let sunFolder = gui.addFolder(`Sun`)
    sunFolder.addColor(params, 'topColor').name('top color').onChange((val) => {
      let clr = new THREE.Color(val)
      uniforms.color_main.value = hexToRgb(clr.getHexString(), true)
    })
    sunFolder.addColor(params, 'bottomColor').name('bottom color').onChange((val) => {
      let clr = new THREE.Color(val)
      uniforms.color_accent.value = hexToRgb(clr.getHexString(), true)
    })

    // Stats - show fps
    this.stats1 = new Stats()
    this.stats1.showPanel(0) // Panel 0 = fps
    this.stats1.domElement.style.cssText = "position:absolute;top:0px;left:0px;"
    // this.container is the parent DOM element of the threejs canvas element
    this.container.appendChild(this.stats1.domElement)
  },
  // @param {number} interval - time elapsed between 2 frames
  // @param {number} elapsed - total time elapsed since app start
  updateScene(interval, elapsed) {
    this.controls.update()
    this.stats1.update()

    for (let i = 0; i < numOfMeshSets; i++) {
      this.meshGroup[i].position.z += interval * params.speed
      this.lineGroup[i].position.z += interval * params.speed
      if (this.meshGroup[i].position.z >= terrainHeight) {
        this.meshGroup[i].position.z -= numOfMeshSets * terrainHeight
        this.lineGroup[i].position.z -= numOfMeshSets * terrainHeight
      }
    }
  }
}

/**************************************************
 * 3. Run the app
 * 'runApp' will do most of the boilerplate setup code for you:
 * e.g. HTML container, window resize listener, mouse move/touch listener for shader uniforms, THREE.Clock() for animation
 * Executing this line puts everything together and runs the app
 * ps. if you don't use custom shaders, pass undefined to the 'uniforms'(2nd-last) param
 * ps. if you don't use post-processing, pass undefined to the 'composer'(last) param
 *************************************************/
runApp(app, scene, renderer, camera, true, uniforms, composer)
