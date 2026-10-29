// skill-eval module: the triggers command (being built).

/** True when one more run at `price` keeps what is spent plus every run in flight within the cap (all micro-dollars). */
const fits = (spent, inFlight, price, cap) => spent + (inFlight + 1) * price <= cap;

export async function triggers() { throw new Error('not built yet'); }

export { fits };
