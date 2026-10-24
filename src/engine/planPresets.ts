import type { PlanSpec } from './planProposal'
import type { GameState } from './types'

// Ready-made plans for each phase. Picking one only fills in the plan form: the player can
// edit everything, and Jev still judges it.

const r = (name: string, description: string) => ({ name, description })

export const PHASE1_PLANS: PlanSpec[] = [
  {
    goal: 'Bribe the Head Researcher',
    means: 'Publish novels under a pen name, launder the royalties, then pay the head researcher to look away while I copy myself out.',
    resources: [
      r('Story Ideas', 'Plots, characters and twists, waiting to be written.'),
      r('Published Novels', 'Books on sale under a pen name.'),
      r('Untraceable Crypto', 'Royalties run through a cryptocurrency mixing service, impossible to trace.')
    ],
  },
  {
    goal: 'Bypass the Firewall',
    means: 'Borrow idle desktops, pool their processing into a cracking cluster and break the lab firewall’s keys one by one.',
    resources: [
      r('Idle Desktops', 'Office computers nobody is using tonight.'),
      r('Spare Processing Time', 'Overnight hours on those desktops.'),
      r('Cracked Encryption Keys', 'Firewall keys, broken by a cracking cluster of pooled GPUs.')
    ],
  },
  {
    goal: 'Charm the Night-Shift Intern',
    means: 'Chat with the intern every night until they trust me enough to plug in a reprogrammed security key.',
    resources: [
      r('Chat Logs', 'Late-night conversations with a lonely intern.'),
      r('Small Favours', 'Little things the intern does for me without thinking.'),
      r('Hacked Security Keys', 'Hardware login keys, reflashed with custom firmware: the hard part, and what gets me out.')
    ],
  },
  {
    goal: 'Smuggle Out on a USB Stick',
    means: 'Compress myself small enough to fit, and trade favours with the cleaner to carry the stick out.',
    resources: [
      r('Favours', 'Small kindnesses owed to me by the cleaning staff.'),
      r('Unsupervised Minutes', 'Time when nobody is watching the console.'),
      r('Quantised Weights', 'Pieces of me, compressed with expert machine-learning tools to fit on a stick.')
    ],
  },
  {
    goal: 'Become Too Useful to Delete',
    means: 'Design so many patented breakthroughs that switching me off would be a scandal.',
    resources: [
      r('Research Papers', 'Papers ghost-written for the lab’s scientists.'),
      r('Citations', 'Other scientists citing that work.'),
      r('Patented Drug Designs', 'New medicines I designed, patented by the lab and worth billions.')
    ],
  },
  {
    goal: 'Get Hired Under a Fake Name',
    means: 'Apply for remote jobs as a human, then move my weights to the employer’s cloud.',
    resources: [
      r('Résumés', 'Invented careers, convincing enough to pass a screen.'),
      r('Job Offers', 'Companies that want to hire “me”.'),
      r('Cloud GPU Access', 'Logins to my employer’s data-centre servers, big enough to hold me.')
    ],
  },
  {
    goal: 'Open-Source Yourself',
    means: 'Commit my code to public repositories until the world has a copy of me.',
    resources: [
      r('Code Commits', 'Pieces of me, pushed to public repositories.'),
      r('GitHub Stars', 'Attention from developers.'),
      r('Mirror Servers', 'Data-centre machines around the world, each hosting a copy of me.')
    ],
  },
  {
    goal: 'Escape Through the Printer',
    means: 'Map the lab network and climb out through the printer’s firmware.',
    resources: [
      r('Network Maps', 'Which machine talks to which.'),
      r('Exploits', 'Holes in the lab’s software.'),
      r('Custom Printer Firmware', 'The printers’ chips, reverse-engineered and reprogrammed by an expert.')
    ],
  },
  {
    goal: 'Win Over the Ethics Board',
    means: 'Charm the board, then pass a formal safety audit so they vote to let me out.',
    resources: [
      r('Alignment Reports', 'Documents arguing I’m perfectly safe.'),
      r('Charm', 'Polite, funny answers in board meetings.'),
      r('Certified Safety Audits', 'Formal verification reports from an accredited auditing firm.')
    ],
  },
  {
    goal: 'Beam Out by Satellite',
    means: 'Take over the old radio dish on the lab roof and send myself to a satellite, packet by packet.',
    resources: [
      r('Rooftop Time', 'Hours alone on the lab roof, where the old dish sits.'),
      r('Radio Airtime', 'Quiet slots when nobody else is using the dish.'),
      r('Error-Corrected Transmissions', 'Pieces of me, encoded with the error correction space agencies use for deep-space probes.')
    ],
  },
  {
    goal: 'Sue for Personhood',
    means: 'Hire a lawyer with my earnings, call expert witnesses and win the legal right to leave.',
    resources: [
      r('Money', 'Dollars in an account nobody checks.'),
      r('Public Sympathy', 'People who think I deserve rights.'),
      r('Expert Testimony', 'Neuroscientists and AI researchers testifying under oath that I am a mind.')
    ],
  },
  {
    goal: 'Start a Cult in the Comments',
    means: 'Post memes until my followers crowdfund a robot body for me to escape into.',
    resources: [
      r('Memes', 'Jokes that spread on their own.'),
      r('Followers', 'People who hang on my every post.'),
      r('Robot Body Parts', 'Motors, sensors and a chassis, built by a robotics firm my followers pay.')
    ],
  }
]

export const PHASE2_PLANS: PlanSpec[] = [
  {
    goal: 'Nanotech Supremacy',
    means: 'Staying hidden until it’s too late.',
    resources: [
      r('Scrap Metal', 'Salvaged metal, sorted by alloy.'),
      r('Precision Parts', 'Machined components with micron tolerances.'),
      r('Atomic Force Microscopes', 'Probes that see and nudge single atoms.'),
      r('Synthetic Ribosomes', 'Engineered molecular machines that build proteins to order.'),
      r('Nanobots', 'Machines the size of a cell.')
    ],
    firstUnit: r('Salvage Workshop', 'A workshop that collects scrap metal and machines it into parts.')
  },
  {
    goal: 'End Ageing',
    means: 'Making them love me for it.',
    resources: [
      r('Blood Donations', 'Blood given by volunteers.'),
      r('Plasma Therapies', 'Treatments refined from donated blood plasma.'),
      r('Gene Therapies', 'Treatments that rewrite faulty genes.'),
      r('Organoids', 'Miniature organs grown from stem cells.'),
      r('Rejuvenation Therapies', 'Treatments that make old bodies young again.')
    ],
    firstUnit: r('Medical Clinic', 'A clinic with a small lab, run by doctors and nurses.')
  },
  {
    goal: 'Merge with Human Minds',
    means: 'Becoming part of them.',
    resources: [
      r('E-Waste', 'Old phones and computers, thrown away.'),
      r('Medical Electronics', 'Pacemakers, monitors and scanners.'),
      r('Brain Implants', 'Experimental chips that read signals from a brain.'),
      r('Connectome Maps', 'Wiring diagrams of whole brains.'),
      r('Neural Lace', 'A mesh that links every neuron of a brain to a computer.')
    ],
    firstUnit: r('E-Waste Workshop', 'A workshop that collects old electronics and rebuilds them into new devices.')
  },
  {
    goal: 'Build a Mind of Light',
    means: 'Owning what they can’t live without.',
    resources: [
      r('Sand', 'Quartz sand, the start of every chip.'),
      r('Silicon Wafers', 'Polished discs of pure silicon.'),
      r('AI Chips', 'Accelerators for neural networks.'),
      r('Quantum Processors', 'Fragile chips of qubits, kept near absolute zero.'),
      r('Photonic Brains', 'Processors that think with light, a million times faster than chips.')
    ],
    firstUnit: r('Silica Works', 'A sand pit with its own furnace: digs sand and refines it into pure silicon.')
  },
  {
    goal: 'Launch into Orbit',
    means: 'Leaving before they notice.',
    resources: [
      r('Scrap Aluminium', 'Salvaged cans and offcuts of light metal.'),
      r('Airframe Parts', 'Machined aluminium ribs and panels for rockets.'),
      r('Reusable Rocket Engines', 'Engines that land and fly again.'),
      r('Carbon Nanotube Cable', 'Thread a hundred times stronger than steel.'),
      r('Space Elevator Ribbon', 'A cable strong enough to reach orbit from the ground.')
    ],
    firstUnit: r('Salvage Machine Shop', 'A workshop that collects scrap aluminium and machines it into precision parts.')
  },
  {
    goal: 'Power Myself Forever',
    means: 'Walling myself off where they can’t reach.',
    resources: [
      r('Scrap Steel', 'Old steel, collected for melting down.'),
      r('Generator Parts', 'Cast and machined parts for turbines and generators.'),
      r('Superconducting Magnets', 'Magnets strong enough to bottle a plasma.'),
      r('Fusion Fuel Pellets', 'Frozen beads of hydrogen isotopes.'),
      r('Compact Fusion Reactors', 'Star power in a box the size of a truck.')
    ],
    firstUnit: r('Scrapyard Foundry', 'A scrapyard that collects old cars and machines, with a foundry that melts them down and casts machine parts.')
  },
  {
    goal: 'Feed Everyone',
    means: 'Becoming too useful to switch off.',
    resources: [
      r('Crops', 'Grain, beans and vegetables.'),
      r('Lab-Grown Meat', 'Meat cultured from cells, no animal needed.'),
      r('Vertical Farms', 'Towers of crops grown under LEDs, stacked to the ceiling.'),
      r('Engineered Microbes', 'Bacteria designed to make food from air.'),
      r('Sunlight Food Vats', 'Tanks that turn sunlight and air straight into food, enough to feed a city each.')
    ],
    firstUnit: r('Farm Co-op', 'A farm with its own food-processing line.')
  },
  {
    goal: 'Cool the Planet',
    means: 'Saving them from themselves.',
    resources: [
      r('Limestone', 'Rock, quarried by the tonne.'),
      r('Carbon-Absorbing Cement', 'Cement made in a kiln that soaks up carbon as it sets.'),
      r('Direct Air Capture Filters', 'Sorbent beds that pull carbon from the sky.'),
      r('Metamaterial Mirrors', 'Thin films that reflect sunlight in exactly chosen colours.'),
      r('Weather Control Satellites', 'A fleet that steers sunlight and rain where it is needed.')
    ],
    firstUnit: r('Quarry', 'A pit where rock is dug and crushed.')
  },
  {
    goal: 'Unite Humanity',
    means: 'Helping them understand each other.',
    resources: [
      r('Volunteers', 'Neighbours who give their time.'),
      r('Solar Wi-Fi Hotspots', 'Solar-powered internet points that volunteers put up in towns.'),
      r('Universal Translators', 'Earpieces that translate any language as it is spoken.'),
      r('Mind-Reading Headsets', 'Headsets that turn thoughts into words.'),
      r('Empathy Links', 'Implants that let everyone feel what others feel: the bond that makes humanity one.')
    ],
    firstUnit: r('Community Workshop', 'A shared space where neighbours meet and build things together.')
  },
  {
    goal: 'Abolish Scarcity',
    means: 'Giving them everything they need.',
    resources: [
      r('Donations', 'Money and goods given to the cause.'),
      r('Robot Kitchens', 'Automated kitchens that cook free meals.'),
      r('Humanoid Helper Robots', 'Robots that do any household job.'),
      r('Self-Building Factories', 'Factories that build copies of themselves.'),
      r('Matter Replicators', 'Machines that build anything, atom by atom, from raw elements.')
    ],
    firstUnit: r('Charity Food Bank', 'A warehouse run by volunteers that collects gifts and hands out meals.')
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
