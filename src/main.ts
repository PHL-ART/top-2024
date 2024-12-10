// @ts-nocheck
import * as THREE from "three/webgpu";
import {
  vec4,
  storage,
  Fn,
  If,
  uniform,
  instanceIndex,
  objectWorldMatrix,
  color,
  screenUV,
  attribute,
} from "three/tsl";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import "./style.css";

let camera, scene, renderer;
let raycaster, pointer;
let stats;

const pointerPosition = uniform(vec4(0));
const elasticity = uniform(0.5); // elasticity ( how "strong" the spring is )
const damping = uniform(0.927); // damping factor ( energy loss )
const brushSize = uniform(0.35);
const brushStrength = uniform(0.14);

const colors = {
  first: 0x980e14,
  second: 0xcdddf2,
  third: 0xf55252,
};

init();

const jelly = Fn(({ renderer, geometry, object }) => {
  const count = geometry.attributes.position.count;

  // replace geometry attributes for storage buffer attributes

  const positionBaseAttribute = geometry.attributes.position;
  const positionStorageBufferAttribute = new THREE.StorageBufferAttribute(
    count,
    3
  );
  const speedBufferAttribute = new THREE.StorageBufferAttribute(count, 3);

  geometry.setAttribute("storagePosition", positionStorageBufferAttribute);

  // attributes

  const positionAttribute = storage(positionBaseAttribute, "vec3", count);
  const positionStorageAttribute = storage(
    positionStorageBufferAttribute,
    "vec3",
    count
  );

  const speedAttribute = storage(speedBufferAttribute, "vec3", count);

  // vectors

  const basePosition = positionAttribute.element(instanceIndex);
  const currentPosition = positionStorageAttribute.element(instanceIndex);
  const currentSpeed = speedAttribute.element(instanceIndex);

  //

  const computeInit = Fn(() => {
    // copy position to storage

    currentPosition.assign(basePosition);
  })().compute(count);

  //

  const computeUpdate = Fn(() => {
    // pinch

    If(pointerPosition.w.equal(1), () => {
      const worldPosition = objectWorldMatrix(object).mul(currentPosition);

      const dist = worldPosition.distance(pointerPosition.xyz);
      const direction = pointerPosition.xyz.sub(worldPosition).normalize();

      const power = brushSize.sub(dist).max(0).mul(brushStrength);

      currentPosition.addAssign(direction.mul(power));
    });

    // compute ( jelly )

    const distance = basePosition.distance(currentPosition);
    const force = elasticity
      .mul(distance)
      .mul(basePosition.sub(currentPosition));

    currentSpeed.addAssign(force);
    currentSpeed.mulAssign(damping);

    currentPosition.addAssign(currentSpeed);
  })().compute(count);

  // initialize the storage buffer with the base position

  computeUpdate.onInit(() => renderer.compute(computeInit));

  //

  return computeUpdate;
});

function init() {
  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    10
  );
  camera.position.set(0, 0, 1);

  scene = new THREE.Scene();

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  // background

  const bgColor = screenUV.y.mix(color(colors.first), color(colors.second));
  const bgVignet = screenUV.distance(0.5).remapClamp(0.3, 0.8).oneMinus();
  const bgIntensity = 3;

  scene.backgroundNode = bgColor.mul(
    bgVignet.mul(color(colors.third).mul(bgIntensity))
  );

  // model

  new GLTFLoader().load("public/models/LeePerrySmith.glb", function (gltf) {
    // create jelly effect material

    const material = new THREE.MeshNormalNodeMaterial();
    // const material = new THREE.MeshPhongMaterial();
    // material.wireframe = true;
    // material.color = colors.first;
    // material.emissive = colors.second;
    // material.specular = colors.third;
    material.geometryNode = jelly();
    material.positionNode = attribute("storagePosition");

    // apply the material to the mesh

    const mesh = gltf.scene.children[0];
    mesh.scale.setScalar(0.1);
    mesh.material = material;
    scene.add(mesh);
  });

  // renderer

  renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  document.body.appendChild(renderer.domElement);

  window.addEventListener("resize", onWindowResize);
  window.addEventListener("pointermove", onPointerMove);
}

function onPointerMove(event) {
  pointer.set(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );

  raycaster.setFromCamera(pointer, camera);

  const intersects = raycaster.intersectObject(scene);

  if (intersects.length > 0) {
    const intersect = intersects[0];

    pointerPosition.value.copy(intersect.point);
    pointerPosition.value.w = 1; // enable
  } else {
    pointerPosition.value.w = 0; // disable
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function animate() {
  renderer.render(scene, camera);
}
