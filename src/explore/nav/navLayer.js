import * as THREE from 'three';
import { latLonToVec } from '../geo';
import { createStartMarker } from './startMarker.js';
import { createMissionBeacon } from './missionBeacon.js';
import { createRouteDots } from './routeDots.js';
import { routeMidpoint } from './routeGeometry';
import { horizonFade } from './navTextures.js';

/**
 * Everything the navigator draws on the globe: START marker, mission beacon and dotted
 * route. One group, added to the planet so it all turns with Mars. These are temporary
 * objects, separate from the 26 permanent landmark markers.
 */
export function createNavLayer() {
  const group = new THREE.Group();
  const start = createStartMarker();
  const beacon = createMissionBeacon();
  const dots = createRouteDots();
  group.add(dots.object, start.object, beacon.object);

  const mid = { local: new THREE.Vector3(), world: new THREE.Vector3(), on: false };
  const tmp = new THREE.Vector3();
  const offscreen = { x: -1e4, y: -1e4, visible: 0 };
  const labels = { start: { ...offscreen }, target: { ...offscreen }, route: { ...offscreen } };

  const toScreen = (world, visible, camera, width, height, out) => {
    tmp.copy(world).project(camera);
    const inFront = tmp.z < 1 && visible > 0.01;
    out.x = inFront ? ((tmp.x + 1) / 2) * width : -1e4;
    out.y = inFront ? ((1 - tmp.y) / 2) * height : -1e4;
    out.visible = inFront ? visible : 0;
  };

  return {
    object: group,
    /** Screen positions of the START, MISSION TARGET and route labels, updated each frame */
    labels,
    setStart(place) {
      start.setPlace(place);
    },
    setDestination(place) {
      beacon.setPlace(place);
    },
    setRoute(route) {
      dots.setRoute(route);
      mid.on = !!route && !route.identical;
      if (mid.on) {
        const m = routeMidpoint(route);
        mid.local.set(...latLonToVec(m.lat, m.lon)).multiplyScalar(1.004);
      }
    },
    update({ camera, width, height, pixelRatio, time, presence, reducedMotion }) {
      start.update({ camera, height, time, presence, reducedMotion });
      beacon.update({ camera, time, presence, reducedMotion });
      dots.update({ camera, height, pixelRatio, time, presence, reducedMotion });

      toScreen(start.world, start.visible, camera, width, height, labels.start);
      toScreen(beacon.top, beacon.visible, camera, width, height, labels.target);
      if (mid.on) {
        mid.world.copy(mid.local).applyMatrix4(group.matrixWorld);
        toScreen(mid.world, horizonFade(mid.world, camera) * presence, camera, width, height, labels.route);
      } else {
        labels.route.visible = 0;
      }
    },
    dispose() {
      start.dispose();
      beacon.dispose();
      dots.dispose();
    },
  };
}
