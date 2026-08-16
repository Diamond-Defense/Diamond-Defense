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

  test('team and player identifiers are unique and references are complete', () => {
    const data = readJson('teams.json');
    const teams = data.teams;
    const teamIds = teams.map((team) => team.id);
    const playerIds = teams.flatMap((team) => team.roster.map((player) => player.playerId));

    expect(data.version).toBe(1);
    expect(new Set(teamIds).size).toBe(teamIds.length);
    expect(new Set(playerIds).size).toBe(playerIds.length);

    for (const team of teams) {
      expect(team).toEqual(expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        coachEmail: expect.any(String),
        roster: expect.any(Array),
      }));

      for (const player of team.roster) {
        expect(player).toEqual(expect.objectContaining({
          name: expect.any(String),
          number: expect.any(String),
          password: expect.any(String),
          playerId: expect.any(String),
        }));
      }
    }
  });
});
