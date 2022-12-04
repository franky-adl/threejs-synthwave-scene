import { maintainBgAspect } from "./common-utils"

/**
 * @param {object} scene the Three.js scene object
 * @param {object} image the path to the background image
 * @returns a Promise that resolves after the texture is loaded as the scene's background
 */
export const loadSceneBackground = (scene, image) => {
  return new Promise((resolve, reject) => {
    var loader = new THREE.TextureLoader();
    loader.load(image, function (texture) {
      scene.background = texture
      // position scene background such that image aspect ratio is preserved
      maintainBgAspect(scene, texture.image.width, texture.image.height)
      // need to maintain background aspect ratio across window resizes
      window.addEventListener("resize", () => {
        maintainBgAspect(scene, texture.image.width, texture.image.height)
      })
      resolve()
    }, undefined, function (error) {
      console.log(error)
      reject(error)
    });
  })
}

/**
 * original reference: https://gist.github.com/jawdatls/465d82f2158e1c4ce161
 * This function lets you get the greyscale color value from a specific point in an image
 * In this scenario, we pass in a displacement map as imageData,
 * and u/v values which gets translated to a certain point on the image
 * getting either one of r/g/b value as the displacement value is the same
 * since the image is supposed to be black and white
 * note that the direction of v axis in texture data is the inverse of the y axis in image data
 *
 * @param {object} imageData the color data of the displacement map image to be passed in
 * @param {number} u the x position [0,1] of the target pixel
 * @param {number} v the y position [0,1] of the target pixel
 * @param {number} cvWidth the width of the heightmap image in canvas
 * @param {number} cvHeight the height of the heightmap image in canvas
 * @returns {number} height value of the requested point within [0,5]
 */
export function getZFromImageDataPoint(imageData, u, v, cvWidth, cvHeight) {
  const mapWidth = cvWidth
  const mapHeight = cvHeight
  const displacementScale = 5
  var x = Math.round(u * (mapWidth - 1))
  var y = Math.round((1 - v) * (mapHeight - 1))
  var index = (y * imageData.width + x) * 4
  var red = imageData.data[index]
  return red / 255 * displacementScale
}

// vertexShader for the Sun
export function vertexShader() {
  return `
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); 
      }
  `
}

// fragmentShader for the Sun
export function fragmentShader() {
  return `
      #ifdef GL_ES
      precision mediump float;
      #endif
      #define PI 3.14159265359
      #define TWO_PI 6.28318530718
      
      uniform vec2 u_resolution;
      uniform vec2 u_mouse;
      uniform float u_time;
      uniform vec3 color_main;
      uniform vec3 color_accent;
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vec2 st = gl_FragCoord.xy/u_resolution.xy;
        float x = vPos.y;
        float osc = ceil(sin((3. - (x - u_time) / 1.5) * 5.) / 2. + 0.4 - floor((3. - x / 1.5) * 5. / TWO_PI) / 10.);
        vec3 color = mix(color_accent, color_main, smoothstep(0.2, 1., vUv.y));
        gl_FragColor = vec4(color, osc);
      }
  `
}