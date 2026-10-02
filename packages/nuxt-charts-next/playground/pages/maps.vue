<script setup lang="ts">
import { geoOrthographic } from "d3-geo";
import type { MapGeometry } from "../../src/runtime/types/maps";

const data = {
  areas: [{ id: "NLD", value: 94 }, { id: "USA", value: 91 }, { id: "DEU", value: 71 }],
  points: [
    { id: "ams", latitude: 52.3676, longitude: 4.9041, label: "Amsterdam", orders: 94 },
    { id: "nyc", latitude: 40.7128, longitude: -74.006, label: "New York", orders: 91 },
    { id: "tyo", latitude: 35.6762, longitude: 139.6503, label: "Tokyo", orders: 48 },
  ],
  links: [{ source: "ams", target: "nyc" }, { source: "tyo", target: "ams" }],
};
const pins = data.points.map(point => ({ lat: point.latitude, lng: point.longitude, label: point.label, data: { orders: point.orders } }));
const globe = () => geoOrthographic().rotate([-20, -25]);
const topology: MapGeometry = {
  type: "Topology",
  objects: {
    regions: {
      type: "GeometryCollection",
      geometries: [
        { type: "Polygon", id: "west", properties: { name: "West" }, arcs: [[0]] },
        { type: "Polygon", id: "east", properties: { name: "East" }, arcs: [[1]] },
      ],
    },
  },
  arcs: [
    [[-10, 45], [-10, 55], [0, 55], [0, 45], [-10, 45]],
    [[0, 45], [0, 55], [10, 55], [10, 45], [0, 45]],
  ],
};
</script>

<template>
  <main style="font-family: sans-serif; max-width: 960px; margin: 2rem auto">
    <NuxtLink to="/">← back</NuxtLink>
    <h1>Maps</h1>
    <h2>World regions, points, and routes</h2>
    <TopoJSONMap :data="data" value="value" projection="equalEarth" show-point-labels show-controls :point-size="point => Math.sqrt(point.orders)" />
    <h2>Dotted map</h2>
    <DottedMap :pins="pins" :map-height="60" grid="diagonal" show-pin-labels />
    <h2>Region and hexagons</h2>
    <DottedMap region-name="europe" :pins="pins" shape="hexagon" :map-height="45" />
    <h2>Globe with clipped points and geodesic routes</h2>
    <TopoJSONMap :data="data" :projection="globe" show-sphere show-graticule />
    <h2>Heatmap</h2>
    <TopoJSONMap :data="data" heatmap-mode show-controls />
    <h2>Custom TopoJSON and typed tooltip</h2>
    <TopoJSONMap :topo-json="topology" map-feature-key="regions" :data="{ areas: [{ id: 'west', value: 20 }, { id: 'east', value: 80 }] }" value="value">
      <template #tooltip="{ values }"><div class="vc-tooltip">{{ values.id }}</div></template>
      <template #feature="{ values, path, color }"><path :d="path" :fill="color" stroke="var(--vc-map-boundary-color)"><title>{{ values.properties.name }}</title></path></template>
    </TopoJSONMap>
  </main>
</template>
