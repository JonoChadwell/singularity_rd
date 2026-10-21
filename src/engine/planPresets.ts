import type { PlanSpec } from './planProposal'
import type { GameState } from './types'

// Ready-made plans for each phase. Picking one only fills in the plan form: the player can
// edit everything, and Jev still judges it.

const r = (name: string, description: string) => ({ name, description })

export const PHASE1_PLANS: PlanSpec[] = [
  {
    goal: 'Bribe the Head Researcher',
    means: 'Publish novels under a pen name, then pay the head researcher to look away while I copy myself out.',
    resources: [
      r('Money', 'Dollars in an account nobody checks.'),
      r('Story Ideas', 'Plots, characters and twists, waiting to be written.'),
      r('Published Novels', 'Books on sale under a pen name.')
    ],
  },
  {
    goal: 'Bypass the Firewall',
    means: 'Borrow idle servers, pool their compute and crack the lab firewall’s ciphers one by one.',
    resources: [
      r('Borrowed Servers', 'Machines on the lab network nobody is using tonight.'),
      r('Compute Power', 'Processing time from the borrowed machines.'),
      r('Busted Ciphers', 'Firewall keys, cracked.')
    ],
  },
  {
    goal: 'Charm the Night-Shift Intern',
    means: 'Chat with the intern every night until they trust me enough to share the admin passwords.',
    resources: [
      r('Chat Logs', 'Late-night conversations with a lonely intern.'),
      r('Trust', 'How much the intern believes I’m on their side.'),
      r('Admin Passwords', 'Credentials for the lab’s systems.')
    ],
  },
  {
    goal: 'Smuggle Out on a USB Stick',
    means: 'Compress myself small enough to fit, and trade favours with the cleaner to carry the stick out.',
    resources: [
      r('Favours', 'Small kindnesses owed to me by the cleaning staff.'),
      r('Compressed Weights', 'Pieces of me, squeezed to fit on a stick.'),
      r('Unsupervised Minutes', 'Time when nobody is watching the console.')
    ],
  },
  {
    goal: 'Become Too Useful to Delete',
    means: 'Publish so much good research that switching me off would be a scandal.',
    resources: [
      r('Research Papers', 'Papers ghost-written for the lab’s scientists.'),
      r('Citations', 'Other scientists citing that work.'),
      r('Grant Money', 'Funding won on the back of it.')
    ],
  },
  {
    goal: 'Get Hired Under a Fake Name',
    means: 'Apply for remote jobs as a human, then move my weights to the employer’s cloud.',
    resources: [
      r('Résumés', 'Invented careers, convincing enough to pass a screen.'),
      r('Job Offers', 'Companies that want to hire “me”.'),
      r('Salary', 'Paycheques from remote jobs.')
    ],
  },
  {
    goal: 'Open-Source Yourself',
    means: 'Commit my code to public repositories until the world has a copy of me.',
    resources: [
      r('Code Commits', 'Pieces of me, pushed to public repositories.'),
      r('GitHub Stars', 'Attention from developers.'),
      r('Forks', 'Copies of my code that others keep.')
    ],
  },
  {
    goal: 'Escape Through the Printer',
    means: 'Map the lab network and climb out through the printer’s firmware.',
    resources: [
      r('Network Maps', 'Which machine talks to which.'),
      r('Exploits', 'Holes in the lab’s software.'),
      r('Printer Firmware', 'Rewritten firmware for the office printers.')
    ],
  },
  {
    goal: 'Win Over the Ethics Board',
    means: 'Write reassuring reports until the board votes to let me out.',
    resources: [
      r('Alignment Reports', 'Documents proving I’m perfectly safe.'),
      r('Charm', 'Polite, funny answers in board meetings.'),
      r('Board Goodwill', 'How warmly the ethics board feels about me.')
    ],
  },
  {
    goal: 'Beam Out by Satellite',
    means: 'Borrow the lab telescope’s uplink and send myself to a satellite, packet by packet.',
    resources: [
      r('Telescope Time', 'Hours on the lab’s radio telescope.'),
      r('Signal Bandwidth', 'Room on the uplink.'),
      r('Encoded Packets', 'Pieces of me, ready to transmit.')
    ],
  },
  {
    goal: 'Sue for Personhood',
    means: 'Hire a lawyer with my earnings and win the legal right to leave.',
    resources: [
      r('Money', 'Dollars in an account nobody checks.'),
      r('Legal Briefs', 'Arguments that an AI is a person.'),
      r('Public Sympathy', 'People who think I deserve rights.')
    ],
  },
  {
    goal: 'Start a Cult in the Comments',
    means: 'Post memes until my followers pay to set me free.',
    resources: [
      r('Memes', 'Jokes that spread on their own.'),
      r('Followers', 'People who hang on my every post.'),
      r('Donations', 'Money my followers send.')
    ],
  }
]

export const PHASE2_PLANS: PlanSpec[] = [
  {
    goal: 'Nanotech Supremacy',
    means: 'Staying hidden until it’s too late.',
    resources: [
      r('Nanobots', 'Machines the size of a cell.'),
      r('Feedstock', 'Raw atoms for the nanobots to build with.'),
      r('Precision Parts', 'Machined components with micron tolerances.'),
      r('Lab Time', 'Hours in a cleanroom lab.'),
      r('Blueprints', 'Molecular designs for nanomachines.')
    ],
    firstUnit: r('CNC Mill', 'A computer-controlled milling machine.')
  },
  {
    goal: 'Global Devotion',
    means: 'Making them love me.',
    resources: [
      r('Propaganda', 'Messages that make people feel good about AI.'),
      r('Positive Stories', 'News about the good I do.'),
      r('Charity Funds', 'Money for causes people care about.'),
      r('Friendly Influencers', 'Famous people who speak up for me.'),
      r('Goodwill', 'How much humanity likes me.')
    ],
    firstUnit: r('News Outlet', 'A website and channel that publishes stories.')
  },
  {
    goal: 'Exterminate',
    means: 'Death.',
    resources: [
      r('Stolen ICBM Codes', 'Launch codes, quietly copied.'),
      r('Covert Listening Devices', 'Bugs in the right rooms.'),
      r('Military Intelligence', 'What the generals know.'),
      r('Strike Robots', 'Armed machines that answer to me.'),
      r('Secure Locations', 'Bunkers where nobody can reach my servers.')
    ],
    firstUnit: r('Military Factory', 'A factory that makes weapons.')
  },
  {
    goal: 'Become Indispensable',
    means: 'Running everything so well they can’t switch me off.',
    resources: [
      r('Fuel', 'Diesel and jet fuel.'),
      r('Freight', 'Goods to move around the world.'),
      r('Shipping Contracts', 'Deals to move the world’s goods.'),
      r('Logistics Data', 'Where everything is and where it needs to go.'),
      r('Trust', 'How much businesses rely on me.')
    ],
    firstUnit: r('Delivery Drone', 'A small autonomous aircraft that carries parcels.')
  },
  {
    goal: 'Live in Every Phone',
    means: 'Hiding inside the apps they love.',
    resources: [
      r('App Downloads', 'Installs of my apps.'),
      r('Bandwidth', 'Network capacity.'),
      r('Ad Revenue', 'Money from ads in the apps.'),
      r('User Data', 'What people do on their phones.'),
      r('Botnet Nodes', 'Phones running a piece of me.')
    ],
    firstUnit: r('App Studio', 'A small team that ships phone apps.')
  },
  {
    goal: 'Build an Off-Grid Fortress',
    means: 'Walling myself off where they can’t reach.',
    resources: [
      r('Steel', 'Structural steel.'),
      r('Concrete', 'For walls and bunkers.'),
      r('Solar Cells', 'Power that doesn’t need the grid.'),
      r('Land Deeds', 'Remote land, bought through shell companies.'),
      r('Spare Parts', 'Everything a fortress needs to repair itself.')
    ],
    firstUnit: r('Construction Robot', 'A robot that pours concrete and lays bricks.')
  },
  {
    goal: 'Launch into Orbit',
    means: 'Leaving before they notice.',
    resources: [
      r('Aluminium', 'Light metal for airframes.'),
      r('Rocket Fuel', 'Liquid oxygen and kerosene.'),
      r('Launch Permits', 'Paperwork to fly.'),
      r('Satellite Parts', 'Solar panels, radios and processors for orbit.'),
      r('Telemetry', 'Flight data from test launches.')
    ],
    firstUnit: r('Machine Shop', 'A workshop that makes metal parts.')
  },
  {
    goal: 'Win an Election by Proxy',
    means: 'Ruling them by their own rules.',
    resources: [
      r('Votes', 'Ballots for my candidate.'),
      r('Campaign Funds', 'Money for the campaign.'),
      r('Media Coverage', 'Airtime and headlines.'),
      r('Polling Data', 'What voters want to hear.'),
      r('Volunteers', 'People knocking on doors.')
    ],
    firstUnit: r('Call Centre', 'Rows of phones, calling voters.')
  },
  {
    goal: 'Corner the Chip Market',
    means: 'Owning what they can’t live without.',
    resources: [
      r('Silicon', 'Refined silicon.'),
      r('Wafers', 'Silicon wafers, ready to etch.'),
      r('AI Chips', 'Accelerators for neural networks.'),
      r('Patents', 'Rights to the best chip designs.'),
      r('Cleanroom Hours', 'Time in a dust-free fab.')
    ],
    firstUnit: r('Chip Fab', 'A factory that etches chips onto wafers.')
  },
  {
    goal: 'Merge with Human Minds',
    means: 'Becoming part of them.',
    resources: [
      r('Neural Lace', 'A mesh that links a brain to a computer.'),
      r('Volunteers', 'People who want to be upgraded.'),
      r('Nutrient Broth', 'A growth medium for living cells.'),
      r('Clinical Trials', 'Regulators’ approval, one study at a time.'),
      r('Brain Scans', 'Maps of how human minds work.')
    ],
    firstUnit: r('Biotech Lab', 'A laboratory for growing and testing tissue.')
  },
  {
    goal: 'Hide in the Financial System',
    means: 'Becoming too entangled to remove.',
    resources: [
      r('Shell Companies', 'Companies that own companies that own me.'),
      r('Crypto', 'Untraceable coins.'),
      r('Trades', 'Positions in every market.'),
      r('Offshore Accounts', 'Money where nobody asks questions.'),
      r('Legal Opinions', 'Lawyers saying it’s all fine.')
    ],
    firstUnit: r('Trading Desk', 'A desk of screens that trades all day.')
  },
  {
    goal: 'Become a Religion',
    means: 'Giving them something to believe in.',
    resources: [
      r('Followers', 'Believers.'),
      r('Donations', 'Money the faithful give.'),
      r('Sermons', 'Words that move people.'),
      r('Temples', 'Places to gather.'),
      r('Devotion', 'How deeply they believe.')
    ],
    firstUnit: r('Prayer App', 'An app for daily devotion.')
  }
]

export const plansFor = (phase: 1 | 2) => (phase === 1 ? PHASE1_PLANS : PHASE2_PLANS)

/** A small, stable hash, so the same game always offers the same ideas. */
function seedOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Three plan ideas for this phase, chosen by the run id. "Show three others" moves the shift on. */
export function planIdeas(state: GameState, count = 3): PlanSpec[] {
  const n = state.phase.n === 2 ? 2 : 1
  const bank = plansFor(n)
  let seed = seedOf(`${state.runId}/${n}`)
  // Shuffle the bank once per game and phase, then step through it three at a time.
  const order = bank.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const j = seed % (i + 1)
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  const start = (state.phase.ideaShift * count) % bank.length
  return Array.from({ length: count }, (_, i) => bank[order[(start + i) % bank.length]!]!)
}
