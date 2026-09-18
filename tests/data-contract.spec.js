import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const positions = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'];
const fieldSize = { width: 3200, height: 2133 };

function expectPointInsideField(point, label) {
  expect(point.x, `${label} x`).toBeGreaterThanOrEqual(0);
  expect(point.x, `${label} x`).toBeLessThan(fieldSize.width);
  expect(point.y, `${label} y`).toBeGreaterThanOrEqual(0);
  expect(point.y, `${label} y`).toBeLessThan(fieldSize.height);
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(root, filename), 'utf8'));
}

test.describe('static data contracts', () => {
  test('all 22 situations have unique keys and complete field coordinates', () => {
    const situations = readJson('situations.json');

    expect(situations).toHaveLength(22);
    expect(new Set(situations.map((s) => s.key)).size).toBe(situations.length);

    for (const situation of situations) {
      expect(situation.key).toEqual(expect.any(String));
      expect(situation.title).toEqual(expect.any(String));
      expect(situation.desc).toEqual(expect.any(String));
      expect(situation.outs).toBeGreaterThanOrEqual(0);
      expect(situation.outs).toBeLessThanOrEqual(2);
      expect(situation.runnersOn).toEqual({
        first: expect.any(Boolean),
        second: expect.any(Boolean),
        third: expect.any(Boolean),
      });
      expect(situation.hit).toEqual(
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      );
      expectPointInsideField(situation.hit, `${situation.key} hit`);
      expect(['line', 'popup', 'grounder']).toContain(situation.hitType);
      expect(situation.playSeq.length).toBeGreaterThan(0);
      expect(situation.playSeq.every((position) => positions.includes(position))).toBe(true);

      for (const position of positions) {
        expect(situation.starts[position], `${situation.key} start ${position}`).toEqual(
          expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        );
        expectPointInsideField(
          situation.starts[position],
          `${situation.key} start ${position}`,
        );
        expect(situation.targets[position], `${situation.key} target ${position}`).toEqual(
          expect.objectContaining({
            x: expect.any(Number),
            y: expect.any(Number),
            tol: expect.any(Number),
          }),
        );
        expectPointInsideField(
          situation.targets[position],
          `${situation.key} target ${position}`,
        );
      }
    }
  });

  test('reference-reviewed situations retain their corrected coaching data', () => {
    const situations = readJson('situations.json');
    const situation = (key) => situations.find((item) => item.key === key);

    expect(situation('BD-02').targets['1B'].notes).toContain('possible back pick');
    expect(situation('BD-02').targets['2B'].notes).toContain('SS side of 2B, cover the bag');
    expect(situation('BD-02').targets['2B'].notes).toContain('2B side of the field, you are the cut/relay');
    expect(situation('BD-04').playSeq).toEqual(['LF', 'SS', '3B']);

    expect(situation('BD-06').targets['1B']).toEqual(expect.objectContaining({ x: 2166, y: 1184 }));
    expect(situation('BD-07').targets['1B']).toEqual(expect.objectContaining({ x: 2166, y: 1184 }));
    expect(situation('BD-17').targets.RF).toEqual(expect.objectContaining({ x: 2127, y: 762 }));
    expect(situation('BD-18').targets.RF).toEqual(expect.objectContaining({ x: 2127, y: 762 }));

    expect(situation('BD-15').playSeq).toEqual(['RF', '2B', '3B']);
    expect(situation('BD-16').playSeq).toEqual(['RF', '2B', 'SS']);
    expect(situation('BD-12').seqNote).toContain('tying or winning run');

    for (const key of ['BD-06', 'BD-12']) {
      expect(situation(key).playOutcome).toEqual(expect.objectContaining({
        result: 'single',
        batterResult: 'second',
        outsRecorded: 0,
        reviewStatus: 'ready',
      }));
    }
  });

});
