import { beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import * as cad from 'replicad'
import openCascade from 'replicad-opencascadejs/src/replicad_with_exceptions.js'

import { summarizeGeometry } from '../../src/kernels/replicad/geometrySummary'

beforeAll(async () => {
  const wasm = new URL(
    import.meta
      .resolve('replicad-opencascadejs/src/replicad_with_exceptions.wasm'),
  )
  cad.setOC(await openCascade({ wasmBinary: readFileSync(wasm) }))
})

describe('Replicad geometry summary', () => {
  test('measures a solid without consuming the shape used for rendering and export', () => {
    const box = cad.makeBox([0, 0, 0], [10, 20, 30])
    try {
      const summary = summarizeGeometry([{ name: 'bracket', shape: box }])
      expect(summary.parts).toHaveLength(1)
      expect(summary.parts[0]).toMatchObject({
        name: 'bracket',
        kind: '3d',
        solidCount: 1,
        valid: true,
        shellsClosed: true,
        volume: 6000,
        surfaceArea: 2200,
        centerOfMass: [5, 10, 15],
      })
      expect(summary.parts[0].bounds.min[0]).toBeCloseTo(0, 5)
      expect(summary.parts[0].bounds.max[2]).toBeCloseTo(30, 5)
      expect(summary.overall).toMatchObject({
        solidCount: 1,
        volumeSum: 6000,
        surfaceAreaSum: 2200,
      })
      expect(summarizeGeometry([{ name: 'bracket', shape: box }])).toEqual(
        summary,
      )
      expect(box.mesh().triangles.length).toBeGreaterThan(0)
      expect(box.blobSTEP().size).toBeGreaterThan(0)
    } finally {
      box.delete()
    }
  })

  test('counts solids inside a single compound separately from output parts', () => {
    const compound = cad.makeCompound([
      cad.makeBox([0, 0, 0], [10, 20, 30]),
      cad.makeBox([20, 0, 0], [30, 20, 30]),
    ])
    try {
      const summary = summarizeGeometry([{ name: 'assembly', shape: compound }])
      expect(summary.parts[0]).toMatchObject({
        solidCount: 2,
        volume: 12000,
        surfaceArea: 4400,
      })
      expect(summary.overall.solidCount).toBe(2)
    } finally {
      compound.delete()
    }
  })

  test('a valid open shell has no enclosed volume or volume-based centre of mass', () => {
    const box = cad.makeBox([0, 0, 0], [10, 20, 30])
    const faces = box.faces
    const shell = cad.weldShellsAndFaces(faces.slice(0, -1))
    try {
      const summary = summarizeGeometry([{ name: 'open box', shape: shell }])
      expect(summary.parts[0]).toMatchObject({
        valid: true,
        shellsClosed: false,
        solidCount: 0,
        volume: null,
        centerOfMass: null,
      })
      expect(summary.overall.volumeSum).toBeNull()
    } finally {
      shell.delete()
      for (const face of faces) face.delete()
      box.delete()
    }
  })

  test('loose faces in a compound do not contaminate solid volume measurements', () => {
    const box = cad.makeBox([0, 0, 0], [10, 20, 30])
    const otherBox = cad.makeBox([20, 0, 0], [30, 20, 30])
    const faces = otherBox.faces
    const compound = cad.makeCompound([box, faces[0]])
    try {
      expect(
        summarizeGeometry([{ name: 'mixed', shape: compound }]).parts[0],
      ).toMatchObject({
        solidCount: 1,
        volume: null,
        centerOfMass: null,
      })
    } finally {
      for (const face of faces.slice(1)) face.delete()
      compound.delete()
      otherBox.delete()
    }
  })

  test('combines bounds and labels totals as sums even when parts overlap', () => {
    const first = cad.makeBox([0, 0, 0], [10, 20, 30])
    const second = cad.makeBox([5, 0, 0], [15, 20, 30])
    try {
      const summary = summarizeGeometry([
        { name: 'first', shape: first },
        { name: 'second', shape: second },
      ])
      expect(summary.overall).toMatchObject({
        solidCount: 2,
        volumeSum: 12000,
        surfaceAreaSum: 4400,
      })
      expect(summary.overall.bounds.max[0]).toBeCloseTo(15, 5)
    } finally {
      first.delete()
      second.delete()
    }
  })

  test('2D bounds leave the drawing cached box usable by the SVG renderer', () => {
    const drawing = cad.drawRectangle(10, 20)
    const input = [{ name: 'outline', shape: drawing }]
    const summary = summarizeGeometry(input)
    expect(summary.parts[0]).toMatchObject({ kind: '2d', name: 'outline' })
    expect(summary.overall).toBeNull()
    expect(summarizeGeometry(input)).toEqual(summary)
    expect(drawing.toSVGViewBox()).toBeTruthy()
    expect(drawing.toSVGPaths().length).toBeGreaterThan(0)
  })

  test('a measurement failure is per-part and prevents misleading overall totals', () => {
    const broken = cad.makeBox([0, 0, 0], [1, 1, 1])
    const box = cad.makeBox([0, 0, 0], [10, 20, 30])
    broken.delete()
    try {
      const summary = summarizeGeometry([
        { name: 'broken', shape: broken },
        { name: 'box', shape: box },
      ])
      expect(summary.parts[0]).toMatchObject({
        kind: 'unavailable',
        name: 'broken',
      })
      expect(summary.parts[1]).toMatchObject({ kind: '3d', volume: 6000 })
      expect(summary.overall).toBeNull()
    } finally {
      box.delete()
    }
  })
})
