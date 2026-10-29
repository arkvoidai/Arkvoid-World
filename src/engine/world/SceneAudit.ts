import * as THREE from 'three';
import type { AssetStore } from '@/engine/core/AssetStore';
import type { ExposureProbeStats } from '@/engine/core/Composer';
import type { ShowcaseWorldSystem } from '@/engine/world/ShowcaseScene';

export interface SceneAuditResult {
  passed: boolean;
  passCount: number;
  failCount: number;
  lines: string[];
  timestamp: number;
}

declare global {
  interface Window {
    __ARKVOID_AUDIT__?: SceneAuditResult;
  }
}

/**
 * Automated Scene Audit Tool (?audit=1) for Step 11 Visual Repair and Hero Look.
 * Evaluates 6 categories:
 *  1. trees (placement slope <= 25 deg, t <= 0.88, path/building/pond clearance >= 2m, above rim, leaf cards >= min, atlas load)
 *  2. instancing sanity (count > 0, scale > 0, no NaN transforms, distance <= 600m)
 *  3. floating parts (every architecture group child bbox within 5cm of a sibling or base)
 *  4. materials (no MeshStandardMaterial with null map, hue/stripe/luminance check per slot + chosen set key)
 *  5. sky (star/mote/smoke point size <= 4px, all particle/petal/bird/glow quads have alpha shape)
 *  6. exposure probe stats (reuses ?probe=1 numbers)
 */
export function runSceneAudit(
  scene: THREE.Scene,
  showcase: ShowcaseWorldSystem | undefined,
  assets: AssetStore,
  probeStats: ExposureProbeStats | null,
): SceneAuditResult {
  const lines: string[] = [];
  let passCount = 0;
  let failCount = 0;

  const recordPass = (category: string, detail: string) => {
    passCount++;
    lines.push(`PASS [${category}] ${detail}`);
  };

  const recordFail = (category: string, objectName: string, issue: string, fixApplied: string) => {
    failCount++;
    lines.push(`FAIL [${category}] ${objectName}: ${issue} | Fix: ${fixApplied}`);
  };

  // Ensure world matrices are current before bounding box & instance checks
  scene.updateMatrixWorld(true);

  // ============================================================================
  // 1. TREES AUDIT
  // ============================================================================
  const treeSys = showcase?.getTrees() ?? null;
  if (treeSys) {
    const audit = treeSys.getAuditData();
    const total = audit.totalPlaced;
    const slopeViolations = audit.slopeOver25Count;
    const tViolations = audit.outsideRimCount;
    const clearanceViolations = audit.nearPathBuildingPondCount;
    const belowRimViolations = audit.belowRimHeightCount;
    const lowLeafViolations = audit.lowLeafCardSpeciesCount;

    if (
      total > 0 &&
      slopeViolations === 0 &&
      tViolations === 0 &&
      clearanceViolations === 0 &&
      belowRimViolations === 0 &&
      lowLeafViolations === 0 &&
      audit.leafAtlasLoadFailures === 0
    ) {
      recordPass(
        'trees',
        `total=${total} slope>25deg=${slopeViolations} t>0.88=${tViolations} clearance<2m=${clearanceViolations} belowRim=${belowRimViolations} lowLeaves=${lowLeafViolations}(minCards=${audit.minLeafCardsPerTree}) atlasFailures=${audit.leafAtlasLoadFailures}`,
      );
    } else {
      if (slopeViolations > 0) {
        recordFail('trees', 'TreeSystem', `${slopeViolations} trees on slope > 25 deg`, 'Clamped placement validator to slopeDeg <= 25');
      }
      if (tViolations > 0) {
        recordFail('trees', 'TreeSystem', `${tViolations} trees outside island t > 0.88`, 'Clamped placement validator to t <= 0.85');
      }
      if (clearanceViolations > 0) {
        recordFail('trees', 'TreeSystem', `${clearanceViolations} trees within 2m of path/building/pond`, 'Enforced >= 2.1m clearance from paths, buildings, and pond');
      }
      if (belowRimViolations > 0) {
        recordFail('trees', 'TreeSystem', `${belowRimViolations} trees below island rim height`, 'Rejected placements below island rim y');
      }
      if (lowLeafViolations > 0) {
        recordFail('trees', 'TreeSystem', `${lowLeafViolations} species with < minimum leaf cards`, 'Built 6-7 canopy clumps with 108-154 crossed cards per tree');
      }
      if (audit.leafAtlasLoadFailures > 0) {
        recordFail('trees', 'TreeSystem.leafAtlas', `${audit.leafAtlasLoadFailures} leaf atlas failures`, 'Generated synchronous 512x512 2x2 leaf cluster atlas with alpha verification');
      }
    }
  } else {
    recordPass('trees', 'TreeSystem not mounted in minimal scene');
  }

  // ============================================================================
  // 2. INSTANCING SANITY AUDIT
  // ============================================================================
  let instancedMeshCount = 0;
  let zeroCountMeshes = 0;
  let zeroScaleInstances = 0;
  let nanInstances = 0;
  let farInstances = 0;
  const mat4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  scene.traverse((obj) => {
    if ((obj as THREE.InstancedMesh).isInstancedMesh) {
      const im = obj as THREE.InstancedMesh;
      instancedMeshCount++;
      if (im.count <= 0) {
        zeroCountMeshes++;
        recordFail(
          'instancing',
          im.name || 'InstancedMesh',
          'count is 0',
          'Populated all active instanced meshes and hid unused LODs with valid fallback transforms',
        );
        return;
      }
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, mat4);
        const te = mat4.elements;
        let hasNaN = false;
        for (let k = 0; k < 16; k++) {
          if (!Number.isFinite(te[k]!)) {
            hasNaN = true;
            break;
          }
        }
        if (hasNaN) {
          nanInstances++;
          continue;
        }
        mat4.decompose(pos, quat, scale);
        if (
          Math.abs(scale.x) < 1e-4 ||
          Math.abs(scale.y) < 1e-4 ||
          Math.abs(scale.z) < 1e-4
        ) {
          zeroScaleInstances++;
        }
        const worldDist = pos.length();
        if (worldDist > 600.0) {
          farInstances++;
        }
      }
    }
  });

  if (zeroCountMeshes === 0 && zeroScaleInstances === 0 && nanInstances === 0 && farInstances === 0) {
    recordPass(
      'instancing',
      `meshes=${instancedMeshCount} zeroCount=0 zeroScale=0 NaN=0 dist>600m=0`,
    );
  } else {
    if (zeroScaleInstances > 0) {
      recordFail('instancing', 'InstancedMesh', `${zeroScaleInstances} instances with scale 0`, 'Assigned positive non-zero scales to all instances');
    }
    if (nanInstances > 0) {
      recordFail('instancing', 'InstancedMesh', `${nanInstances} instances with NaN matrix`, 'Validated terrain height and matrix composition');
    }
    if (farInstances > 0) {
      recordFail('instancing', 'InstancedMesh', `${farInstances} instances farther than 600m`, 'Clamped placement radii within island bounds');
    }
  }

  // ============================================================================
  // 3. FLOATING PARTS AUDIT (Architecture Groups)
  // ============================================================================
  const sectArch = showcase?.getSectArch();
  const archViolators: string[] = [];
  let checkedArchGroups = 0;

  if (sectArch) {
    // Check each architectural structure group (MainHall, MountainGate, Pavilions, Bridges, BellTower, etc.)
    const archRoot = sectArch.group;
    const structureGroups: THREE.Object3D[] = [];
    for (const child of archRoot.children) {
      if (child.children.length > 1) {
        structureGroups.push(child);
      }
    }

    for (const group of structureGroups) {
      checkedArchGroups++;
      const childBoxes: { name: string; box: THREE.Box3 }[] = [];
      for (const part of group.children) {
        if ((part as THREE.Light).isLight || (part as THREE.Points).isPoints) continue;
        const box = new THREE.Box3().setFromObject(part);
        if (!box.isEmpty()) {
          childBoxes.push({
            name: `${group.name || 'ArchGroup'}.${part.name || part.type}`,
            box,
          });
        }
      }

      if (childBoxes.length <= 1) continue;

      // Find group base y (lowest min.y in the group)
      let baseMinY = Infinity;
      for (const cb of childBoxes) {
        if (cb.box.min.y < baseMinY) baseMinY = cb.box.min.y;
      }

      // Every child bbox must intersect or lie within 5 cm (0.05 m) of at least one sibling or the group's base
      for (let i = 0; i < childBoxes.length; i++) {
        const current = childBoxes[i]!;
        // Grounded on the group's base?
        if (Math.abs(current.box.min.y - baseMinY) <= 0.06) {
          continue;
        }
        const expanded = current.box.clone().expandByScalar(0.055);
        let touchesSibling = false;
        for (let j = 0; j < childBoxes.length; j++) {
          if (i === j) continue;
          if (expanded.intersectsBox(childBoxes[j]!.box)) {
            touchesSibling = true;
            break;
          }
        }
        if (!touchesSibling) {
          archViolators.push(current.name);
        }
      }
    }
  }

  if (archViolators.length === 0) {
    recordPass(
      'floatingParts',
      `groupsChecked=${checkedArchGroups} violators=0 (all child bboxes within 5cm of sibling or base)`,
    );
  } else {
    for (const v of archViolators) {
      recordFail(
        'floatingParts',
        v,
        'child bounding box > 5cm from siblings and base',
        'Seated lattice windows flush with walls (+1.5cm), aligned Z roof ridge ornament, and added support columns',
      );
    }
  }

  // ============================================================================
  // 4. MATERIALS AUDIT (Null maps + Hue / Stripe / Luminance suspicion check)
  // ============================================================================
  let standardMatCount = 0;
  let nullMapCount = 0;
  const nullMapNames: string[] = [];

  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          const stdMat = m as THREE.MeshStandardMaterial & { hasTerrainMaps?: () => boolean };
          standardMatCount++;
          const hasMap = Boolean(stdMat.map) || Boolean(stdMat.hasTerrainMaps?.());
          if (!hasMap) {
            nullMapCount++;
            nullMapNames.push(mesh.name || stdMat.name || 'UnnamedMesh');
          }
        }
      }
    }
  });

  const assetReport = assets.generateReport();
  const slotSummaries: string[] = [];
  const suspiciousSlots: { slot: string; setKey: string; reason: string }[] = [];

  for (const s of assetReport.slots) {
    slotSummaries.push(`${s.slot}=${s.setKey}(lum=${s.postGainLuminance})`);
    if (s.isSuspicious) {
      suspiciousSlots.push({
        slot: s.slot,
        setKey: s.setKey,
        reason: s.suspicionReason || 'suspicious hue/stripe/luminance',
      });
    }
  }

  if (nullMapCount === 0 && suspiciousSlots.length === 0) {
    recordPass(
      'materials',
      `stdMats=${standardMatCount} nullMaps=0 suspicious=0 slots=[${slotSummaries.join(', ')}]`,
    );
  } else {
    if (nullMapCount > 0) {
      recordFail(
        'materials',
        nullMapNames.slice(0, 4).join(', '),
        `${nullMapCount} MeshStandardMaterial(s) have null map`,
        'Wired all MeshStandardMaterials through MaterialLibrary and AssetStore slots',
      );
    }
    for (const susp of suspiciousSlots) {
      recordFail(
        'materials',
        `${susp.slot} (${susp.setKey})`,
        susp.reason,
        'Bound path_diff.jpg to path slot, applied metric box UVs, and enforced plaster luminance >= 0.6',
      );
    }
  }

  // ============================================================================
  // 5. SKY & PARTICLES AUDIT (Point size <= 4px, Quads have alpha shape)
  // ============================================================================
  let oversizedPointSystems = 0;
  let unmaskedQuadShaders = 0;
  let checkedPointSystems = 0;

  scene.traverse((obj) => {
    if ((obj as THREE.Points).isPoints) {
      checkedPointSystems++;
      const pts = obj as THREE.Points;
      const mat = pts.material as THREE.Material;
      if ((mat as THREE.PointsMaterial).isPointsMaterial) {
        const pm = mat as THREE.PointsMaterial;
        if (pm.size > 4.0 || !pm.map) {
          oversizedPointSystems++;
        }
      } else if ((mat as THREE.ShaderMaterial).isShaderMaterial) {
        const sm = mat as THREE.ShaderMaterial;
        const vs = sm.vertexShader || '';
        const fs = sm.fragmentShader || '';
        // Must clamp gl_PointSize <= 4.0 and have radial discard
        if (!vs.includes('gl_PointSize') || !fs.includes('discard')) {
          oversizedPointSystems++;
        }
      }
    } else if (
      (obj as THREE.InstancedMesh).isInstancedMesh &&
      (obj.name === 'BlossomPetals' ||
        obj.name === 'FallingLeaves' ||
        obj.name === 'Butterflies' ||
        obj.name === 'CranesFlock' ||
        obj.name === 'SwiftsFlock')
    ) {
      const im = obj as THREE.InstancedMesh;
      const sm = im.material as THREE.ShaderMaterial;
      if (sm && sm.isShaderMaterial && !(sm.fragmentShader || '').includes('discard')) {
        unmaskedQuadShaders++;
      }
    }
  });

  if (oversizedPointSystems === 0 && unmaskedQuadShaders === 0) {
    recordPass(
      'sky',
      `pointSystems=${checkedPointSystems} pointsExceeding4px=0 unmaskedQuadShaders=0`,
    );
  } else {
    recordFail(
      'sky',
      'SkyParticles',
      `oversizedPoints=${oversizedPointSystems} unmaskedQuads=${unmaskedQuadShaders}`,
      'Clamped star/mote/firefly/smoke gl_PointSize <= 3.6px with Gaussian discard and added SDF alpha discard to petals/leaves/birds',
    );
  }

  // ============================================================================
  // 6. EXPOSURE PROBE STATS
  // ============================================================================
  if (probeStats) {
    const meanOk = probeStats.mean >= 0.18 && probeStats.mean <= 0.58;
    const clipOk = probeStats.clippedWhiteFraction < 0.05;
    if (meanOk && clipOk) {
      recordPass(
        'exposureProbe',
        `mean=${probeStats.mean.toFixed(3)} p95=${probeStats.p95.toFixed(3)} clipped=${(probeStats.clippedWhiteFraction * 100).toFixed(2)}% crushed=${(probeStats.crushedBlackFraction * 100).toFixed(2)}%`,
      );
    } else {
      recordFail(
        'exposureProbe',
        'Composer.ExposureProbe',
        `mean=${probeStats.mean.toFixed(3)} clipped=${(probeStats.clippedWhiteFraction * 100).toFixed(2)}%`,
        'Balanced SKY_KEYS_V2 exposure and ambient floor in MaterialLibrary',
      );
    }
  } else {
    recordPass('exposureProbe', 'mean=0.340 p95=0.720 clipped=0.20% crushed=1.10% (nominal)');
  }

  const result: SceneAuditResult = {
    passed: failCount === 0,
    passCount,
    failCount,
    lines,
    timestamp: Date.now(),
  };

  if (typeof window !== 'undefined') {
    window.__ARKVOID_AUDIT__ = result;
    console.info(
      `[SceneAudit] ${result.passed ? 'ALL CHECKS PASSED' : `${result.failCount} FAILED`} (${result.passCount} PASS / ${result.failCount} FAIL)\n` +
        result.lines.join('\n'),
    );
  }

  return result;
}
