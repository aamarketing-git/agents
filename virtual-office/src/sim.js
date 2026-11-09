import { SEATS, MEETING } from './office.js';
import { plan } from './brain.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Company {
  constructor(agents, log) { this.agents = agents; this.byId = Object.fromEntries(agents.map((a) => [a.id, a])); this.log = log; this.busy = false; }

  async say(a, text, ms = 1800) { a.say = text; a.sayKind = ''; await sleep(ms); a.say = ''; }

  async gather(ceoLine) {
    const ceo = this.byId.ceo;
    await Promise.all(this.agents.map((a, i) => a.goTo(MEETING[i][0], MEETING[i][1], 'meeting')));
    this.log(ceo, ceoLine);
    await this.say(ceo, ceoLine, 2600);
  }

  async work(step) {
    const a = this.byId[step.agent], s = SEATS[a.id];
    await a.goTo(s.x, s.z + 0.9, s.room);
    a.state = 'working'; a.say = step.doing; a.sayKind = 'work';
    await sleep(step.ms);
    a.state = 'idle'; a.say = ''; a.sayKind = '';
    this.log(a, step.result);
    await this.say(a, '✅ ' + step.result, 1400);
  }

  async run(goal) {
    if (this.busy) return; this.busy = true;
    try {
      const ceo = this.byId.ceo;
      await ceo.goTo(SEATS.ceo.x, SEATS.ceo.z + 0.9, 'ceo');
      this.log(ceo, `목표 접수: ${goal}`);
      await this.say(ceo, '목표를 분석하는 중…', 1500);
      const p = await plan(goal);
      for (const ph of p.phases) {
        if (ph.meet) await this.gather(ph.meet);
        if (ph.work) await Promise.all(ph.work.map((s) => this.work(s)));
      }
      this.log(ceo, p.summary);
      await ceo.goTo(SEATS.ceo.x, SEATS.ceo.z + 0.9, 'ceo');
      await this.say(ceo, '🎉 ' + p.summary, 3000);
      await Promise.all(this.agents.filter((a) => a !== ceo).map((a) => a.goTo(SEATS[a.id].x, SEATS[a.id].z + 0.9, SEATS[a.id].room)));
    } finally { this.busy = false; }
  }
}
