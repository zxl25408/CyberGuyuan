/** Bounded fixed steps preserve game time at 10–60 FPS without giant physics steps. */
export class SimulationClock {
  private pending=0;
  readonly step=1/60;
  reset(){this.pending=0;}
  advance(seconds:number, update:(dt:number)=>void):number {
    if(!Number.isFinite(seconds)||seconds<0)return 0;
    this.pending=Math.min(this.pending+seconds,.25);
    let count=0;
    while(this.pending+1e-9>=this.step&&count<15){update(this.step);this.pending-=this.step;count++;}
    return count;
  }
}
