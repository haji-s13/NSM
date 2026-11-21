import { SignInCard } from "@/components/auth/sign-in-card";

/** First screen: what the planner does, beside the sign-in card. */
export function HomeScreen() {
  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-[max(16px,env(safe-area-inset-left))] py-8 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-16 md:px-8 md:py-16">
      <section className="flex min-w-0 flex-col gap-6">
        <p className="text-meta uppercase text-signal">Norwegian Singles method</p>
        <h1 className="font-display text-[2rem] leading-10 font-black md:text-display">
          Run more at threshold. <span className="font-extralight">Without crossing it.</span>
        </h1>
        <p className="max-w-[65ch] text-muted-foreground">
          Enter a 5k or 10k PB. Get sub-threshold pace ranges from Jack Daniels&apos; VDOT, a 12-week plan that adds volume no faster than 5% a week, and workouts you can send to your watch.
        </p>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-meta uppercase text-muted-foreground">A Tuesday in week 1</p>
          <p className="num mt-2 text-[1.25rem] leading-8 font-black">5 × 1 km @ 4:12–4:18/km</p>
          <p className="num text-muted-foreground">60s jog · 2 km warm-up · 1.5 km cool-down · ~44 min</p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {[
            ["Paces", "15k, half and 30k bands from your VDOT"],
            ["Run plan", "Base, build, peak and a taper week"],
            ["HYROX", "12 weeks of stations, extra work on your weak ones"],
            ["Watch", "Send to COROS or intervals.icu"],
            ["Profile", "Save both plans and open them anywhere"],
          ].map(([k, v]) => (
            <li key={k} className="flex flex-col border-t pt-2">
              <span className="font-black">{k}</span>
              <span className="text-muted-foreground">{v}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="min-w-0 md:pt-8">
        <SignInCard />
      </section>
    </main>
  );
}
