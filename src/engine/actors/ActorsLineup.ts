import * as THREE from 'three';
import { Wanderer } from '@/engine/actors/Wanderer';
import type { FormId, LeaningId, ResidentId } from '@/engine/actors/WandererMaterials';
import type { AnimationStateName } from '@/engine/actors/Animator';
import { heightAt } from '@/engine/world/collision';

export interface LineupActorEntry {
  wanderer: Wanderer;
  form: FormId;
  leaning: LeaningId;
  title: string;
  resident?: ResidentId;
}

const ANIMATION_CYCLE: AnimationStateName[] = [
  'idle',
  'walk',
  'run',
  'sit-meditate',
  'bow',
  'wave',
  'talk',
  'gather',
];

export class ActorsLineup {
  readonly group = new THREE.Group();
  readonly entries: LineupActorEntry[] = [];
  private cycleTimer = 0;
  private currentAnimIndex = 0;
  private autoCycle = true;

  constructor() {
    this.group.name = 'ActorsLineupGroup';
    this.buildLineup();
  }

  private buildLineup(): void {
    const forms: FormId[] = [0, 1, 2, 3];
    const leanings: LeaningId[] = ['dawn', 'dusk', 'still'];
    const formNames = ['Traveller', 'Scholar', 'Warden', 'Sage'];

    // 4 Forms x 3 Leanings = 12 Wanderers arranged in the plaza (centered around z = 4, x = -6 to 6)
    forms.forEach((form, fIdx) => {
      leanings.forEach((leaning, lIdx) => {
        const x = (lIdx - 1) * 3.2 + (fIdx % 2 === 0 ? -0.4 : 0.4);
        const z = -2.5 + fIdx * 2.8;
        const groundY = heightAt(x, z) ?? 0;

        const wanderer = new Wanderer({
          form,
          leaning,
        });

        wanderer.position.set(x, groundY, z);
        // Face slightly toward center/front
        wanderer.rotation.y = Math.PI + (x * 0.05);

        this.group.add(wanderer);
        this.entries.push({
          wanderer,
          form,
          leaning,
          title: `Form ${form} · ${formNames[form]} (${leaning})`,
        });
      });
    });

    // 4 Residents alongside the lineup
    const residents: { id: ResidentId; name: string; x: number; z: number }[] = [
      { id: 'hale', name: 'Elder Hale', x: -5.5, z: 2.0 },
      { id: 'ione', name: 'Archivist Ione', x: -5.5, z: -1.0 },
      { id: 'tamsin', name: 'Keeper Tamsin', x: 5.5, z: -1.0 },
      { id: 'corvin', name: 'Junior Corvin', x: 5.5, z: 2.0 },
    ];

    for (const r of residents) {
      const groundY = heightAt(r.x, r.z) ?? 0;
      const wanderer = new Wanderer({
        resident: r.id,
      });
      wanderer.position.set(r.x, groundY, r.z);
      wanderer.rotation.y = r.x < 0 ? -Math.PI / 2 + 0.3 : Math.PI / 2 - 0.3;

      this.group.add(wanderer);
      this.entries.push({
        wanderer,
        form: wanderer.form,
        leaning: wanderer.leaning,
        resident: r.id,
        title: `Resident: ${r.name}`,
      });
    }
  }

  setAnimation(anim: AnimationStateName): void {
    this.autoCycle = false;
    for (const e of this.entries) {
      e.wanderer.setAnimationState(anim, 0.2);
    }
  }

  setAutoCycle(enabled: boolean): void {
    this.autoCycle = enabled;
  }

  getCurrentAnimation(): AnimationStateName {
    return ANIMATION_CYCLE[this.currentAnimIndex] ?? 'idle';
  }

  update(dt: number, windVector?: THREE.Vector2): void {
    const clampedDt = Math.min(dt, 0.1);

    if (this.autoCycle) {
      this.cycleTimer += clampedDt;
      if (this.cycleTimer >= 4.0) {
        // Change animation every 4 seconds
        this.cycleTimer = 0;
        this.currentAnimIndex = (this.currentAnimIndex + 1) % ANIMATION_CYCLE.length;
        const nextAnim = ANIMATION_CYCLE[this.currentAnimIndex]!;
        for (const e of this.entries) {
          e.wanderer.setAnimationState(nextAnim, 0.25);
        }
      }
    }

    const currentAnim = ANIMATION_CYCLE[this.currentAnimIndex] ?? 'idle';
    const fakeSpeed = currentAnim === 'walk' ? 1.8 : currentAnim === 'run' ? 4.2 : 0;

    for (const e of this.entries) {
      const gy = heightAt(e.wanderer.position.x, e.wanderer.position.z) ?? 0;
      e.wanderer.update(clampedDt, fakeSpeed, windVector, gy);
    }
  }

  dispose(): void {
    for (const e of this.entries) {
      e.wanderer.dispose();
      this.group.remove(e.wanderer);
    }
    this.entries.length = 0;
  }
}
