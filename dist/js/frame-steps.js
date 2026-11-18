// Retain a short backlog after a slow draw. Every integrated step still has
// the same duration, including the steps that produce contact measurements.
export function advanceFrame(debt, step, budgetMs, advance, captureStart, captureEnd, now=performance.now.bind(performance)){
  let remaining=Math.min(debt,50*step);
  const deadline=now()+budgetMs;
  while(remaining>=step){
    const last=remaining-step<step || now()>=deadline;
    if(last)captureStart();
    if(advance()===false)return 0;
    remaining-=step;
    if(last){
      captureEnd();
      break;
    }
  }
  return remaining;
}
