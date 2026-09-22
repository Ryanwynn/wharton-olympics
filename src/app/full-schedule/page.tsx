export const metadata = { title: "Full Day Schedule — Wharton Cluster Olympics" };

// Static schedule from the Office of Student Life (Wharton Olympics 2026 Student Schedule).
const ROWS: { time: string; event: string; location: string[] }[] = [
  {
    time: "11:00 a.m.",
    event: "Arrival",
    location: [
      "Sports participants + spectators: arrive at your event location at 11:00 a.m.",
      "Everyone else: arrive at Shoemaker Green for fun and other activities.",
    ],
  },
  {
    time: "11:10 a.m.–12:20 p.m.",
    event: "Morning Competitions",
    location: [
      "Basketball – Rockwell Gymnasium",
      "Soccer – Adams Field",
      "Pickleball – Pottruck Court #3",
      "Weightlifting – Fox Fitness",
    ],
  },
  {
    time: "12:35–2:25 p.m.",
    event: "Olympic Village + Food Trucks",
    location: ["Shoemaker Green", "Food trucks sponsored by OSL — no need to bring money."],
  },
  { time: "12:50–1:00 p.m.", event: "Cluster Pride Roll Call + Announcements", location: ["Shoemaker Green"] },
  { time: "1:00–1:15 p.m.", event: "Rock-Paper-Scissors", location: ["Shoemaker Green"] },
  { time: "1:20–1:40 p.m.", event: "Tug of War", location: ["Shoemaker Green"] },
  { time: "1:45–2:00 p.m.", event: "Potato Sack Relay", location: ["Shoemaker Green"] },
  { time: "2:00–2:10 p.m.", event: "Mascot Race", location: ["Shoemaker Green"] },
  {
    time: "2:30–3:20 p.m.",
    event: "Championship Games",
    location: ["Basketball – Rockwell Gymnasium", "Soccer – DCC Field"],
  },
  { time: "3:20–3:35 p.m.", event: "Return to Shoemaker Green", location: ["Shoemaker Green"] },
  { time: "4:00–4:30 p.m.", event: "Awards + Final Announcements", location: ["Shoemaker Green"] },
];

export default function FullSchedulePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold text-penn-blue sm:text-3xl">Full Day Schedule</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Wharton Olympics 2026 · Sunday, September 27, 2026 · Shoemaker Green + competition sites
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[600px] border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-penn-red bg-penn-blue text-xs uppercase tracking-wide text-white">
              <th scope="col" className="w-52 px-4 py-3 font-semibold">Time</th>
              <th scope="col" className="w-56 px-4 py-3 font-semibold">Event</th>
              <th scope="col" className="px-4 py-3 font-semibold">Location</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => (
              <tr key={r.time} className={`border-b border-border last:border-0 ${i % 2 ? "bg-surface-alt/40" : ""}`}>
                <td className="px-4 py-3 align-top text-sm font-semibold text-ink">{r.time}</td>
                <td className="px-4 py-3 align-top">
                  <span className="font-serif font-semibold text-penn-blue">{r.event}</span>
                </td>
                <td className="px-4 py-3 align-top text-sm text-ink">
                  {r.location.length === 1 ? (
                    r.location[0]
                  ) : (
                    <ul className="space-y-0.5">
                      {r.location.map((l, j) => (
                        <li key={j}>{l}</li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm font-medium text-ink-muted">Event programming concludes at 4:30 p.m.</p>
    </div>
  );
}
