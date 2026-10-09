/** All landing-page copy lives here so it can be edited without touching
 * any component. Types are the shape each section component expects. */

export const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "Ironing", href: "#ironing" },
  { label: "How it works", href: "#process" },
  { label: "Crew", href: "#crew" },
  { label: "Services", href: "#services" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
] as const;

/** The voice: warm, plain, a little playful. Sell the result (crisp clothes,
 * on time, no chasing) before the process. Never compare ourselves with, or
 * talk down to, the local ironing services people already use. */
export const HERO = {
  eyebrow: "Automatic ironing, picked up & delivered · Hyderabad",
  title: "Crisp clothes.",
  titleAccent: "Ready when you are.",
  quote: "Bhaiya, zara achhe se kar dena please.",
  body: "You've said it a hundred times. IRON MAN makes it the standard: our automatic ironing machines give every piece the same sharp, even finish, picked up from your door and back on time, without you having to follow up.",
  chips: ["Automatic ironing", "Free pickup & delivery", "Back in 24–48 hours"],
};

export const IRONING = {
  eyebrow: "Our hero service",
  title: "Automatic ironing is what we do best.",
  body: "No handheld irons here. Your clothes go through professional automatic garment-pressing machines: steam relaxes the fibres, a controlled press sets the crease, and every shirt, kurta and saree gets the same crisp finish, piece after piece.",
  items: ["Shirts & T-shirts", "Trousers & jeans", "Kurtas", "Sarees", "Bedsheets", "The whole pile"],
  points: [
    "Machine-pressed, so the finish is the same on every piece",
    "Counted with you at the door, and the same count comes back",
    "Free pickup and delivery, on a slot that suits you",
  ],
};

/** Stills from IRON MAN's own brand film, shown beside the ironing pitch so
 * the first thing a visitor sees is a machine, not a handheld iron. Swap in
 * photographs of the real machines under /public/machine when they exist. */
export const MACHINES = [
  {
    key: "press",
    src: "/machine/press.jpg",
    label: "Automatic press",
    alt: "An automatic garment-pressing plate with a glowing yellow edge, pressing a white shirt",
  },
  {
    key: "robot",
    src: "/machine/robot.jpg",
    label: "Steam finishing",
    alt: "A steam finishing cabinet where robotic arms hold and steam a hanging shirt",
  },
] as const;

export const CONTACT_PHONE = "+91 98765 43210";
export const CONTACT_PHONE_TEL = "+919876543210";
export const CONTACT_EMAIL = "hello@ironman.example";
export const CONTACT_ADDRESS = "Barkatpura, Kacheguda, Hyderabad, Telangana 500027";
export const CONTACT_HOURS = "Mon–Sat, 8:00 AM – 9:00 PM";
export const CONTACT_INSTAGRAM =
  "https://www.instagram.com/ironmanhyderabad?stkn=MW1qd2tpZm1tMTMyaQ==";

/** The story band: read aloud by the page as you scroll. The closing line
 * (from `emphasisFrom`) gets the brand highlight. */
export const STORY = {
  eyebrow: "The feeling",
  words:
    "You hand over your favourite shirt and say, \u201czara achhe se kar dena please.\u201d Then you wait, and wonder. IRON MAN ends the wondering: crisp clothes, picked up and delivered, ready when you are.",
  /** From this word to the end is highlighted. */
  emphasisFrom: "crisp",
};

/** The scroll-scrubbed brand film. Each caption owns a stretch of the scroll
 * (`from`..`to`, as a share of the film). They describe what the picture
 * shows: steam, press, finish. */
export const FILM = {
  eyebrow: "See it happen",
  title: "Watch the crisp happen.",
  captions: [
    { from: 0.13, to: 0.3, text: "It starts with steam." },
    { from: 0.31, to: 0.46, text: "Every fibre, relaxed." },
    { from: 0.5, to: 0.66, text: "Pressed to a crisp edge." },
    { from: 0.67, to: 0.82, text: "Then checked, and folded." },
    { from: 0.86, to: 1, text: "Crisp clothes. Ready when you are." },
  ],
};

export type CrewMember = {
  key: "rider" | "presser" | "checker";
  role: string;
  line: string;
  /** A real photo (under /public/crew) replaces the illustration when set. */
  photo?: string;
};

/** The people behind an order. Drawn as illustrations until there are real
 * photos: add the file under /public/crew and set `photo` below. */
export const CREW: { title: string; body: string; members: CrewMember[] } = {
  title: "The crew behind your crisp clothes.",
  body: "From your door to our hub and back again, real people handle every piece.",
  members: [
    {
      key: "rider",
      role: "Pickup & delivery rider",
      line: "Counts every piece with you at the door, and brings it back on the slot you chose.",
    },
    {
      key: "presser",
      role: "Ironing specialist",
      line: "Runs our automatic presses, so every shirt, kurta and saree gets the same sharp, even finish.",
    },
    {
      key: "checker",
      role: "Quality check",
      line: "One last look at every piece before it's folded and packed.",
    },
  ],
};

export type Service = {
  slug: string;
  /** A real photograph under /public/services replaces the illustration. */
  photo?: string;
  title: string;
  description: string;
  bullets: [string, string];
};

export const SERVICES: Service[] = [
  {
    slug: "wash-fold",
    title: "Wash & Fold",
    description: "Everyday laundry, washed, folded and packed fresh.",
    bullets: ["Sorted by colour and fabric", "Folded and packed, ready for the shelf"],
  },
  {
    slug: "dry-cleaning",
    title: "Dry Cleaning",
    description: "Gentle care for suits, silks and the clothes you save for best.",
    bullets: ["Safe for delicate fabrics", "Pressed and hung, ready to wear"],
  },
  {
    slug: "saree-drapery",
    title: "Saree Care",
    description: "Pressed and packed with the care a good saree deserves.",
    bullets: ["Gentle on zari and borders", "Folded flat, never crushed on the way"],
  },
  {
    slug: "designer-garment",
    title: "Occasion Wear",
    description: "Extra care for the outfit you've been saving for the big day.",
    bullets: ["Gentle, label-safe handling", "Priority handling when it matters"],
  },
  {
    slug: "shoe-sneaker",
    title: "Sneaker Care",
    description: "Deep cleaning that brings your favourite pair back to life.",
    bullets: ["Soles, uppers and laces", "Leather conditioning on request"],
  },
  {
    slug: "express",
    title: "Same-Day Express",
    description: "In by morning, back by evening. For the days that sneak up on you.",
    bullets: ["Morning pickup, evening delivery", "Moves to the front of the queue"],
  },
];

export type NumberedFeature = {
  number: string;
  title: string;
  description: string;
  icon: "truck" | "shield" | "receipt" | "zap" | "map-pin" | "message-circle";
};

export const NUMBERED_FEATURES: NumberedFeature[] = [
  {
    number: "01",
    title: "Crisp, every time",
    description: "Automatic ironing gives every piece the same sharp finish. Monday's shirt looks like Friday's.",
    icon: "shield",
  },
  {
    number: "02",
    title: "Free pickup & delivery",
    description: "From your door, on a slot you choose. No extra charge, no trip to make.",
    icon: "truck",
  },
  {
    number: "03",
    title: "On time, as promised",
    description: "We tell you when your clothes are coming back, and that's when they come back.",
    icon: "zap",
  },
  {
    number: "04",
    title: "Know where your clothes are",
    description: "A simple link shows every step, from pickup to your door. No need to call and ask.",
    icon: "map-pin",
  },
  {
    number: "05",
    title: "Clear prices",
    description: "See the price before you book. What you see is what you pay.",
    icon: "receipt",
  },
  {
    number: "06",
    title: "Book in a message",
    description: "On WhatsApp or the website, in under a minute. Whichever is easier.",
    icon: "message-circle",
  },
];

export type ProcessStep = {
  title: string;
  description: string;
  icon: "calendar" | "clipboard-check" | "sparkles" | "receipt" | "package-check";
};

export const PROCESS_STEPS: ProcessStep[] = [
  {
    title: "Book a pickup",
    description: "On the website or WhatsApp, in under a minute. Pick a slot that suits your day.",
    icon: "calendar",
  },
  {
    title: "Hand it over",
    description: "Our rider counts every piece with you at the door, so you know exactly what's with us.",
    icon: "clipboard-check",
  },
  {
    title: "We make it crisp",
    description: "Every piece goes through our automatic pressing machines for the same sharp finish, then gets checked once more before it's packed.",
    icon: "sparkles",
  },
  {
    title: "You see the bill first",
    description: "The prices you saw when you booked, itemised, before anything reaches your door.",
    icon: "receipt",
  },
  {
    title: "Back at your door",
    description: "On time and ready to wear. Pay by cash or UPI when it arrives.",
    icon: "package-check",
  },
];

export type ImpactStat = {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  label: string;
};

/** Promises we keep on every order, not vanity counts. Replace with real
 * figures (a Google rating, garments ironed) only once they can be shown to be true. */
export const IMPACT_STATS: ImpactStat[] = [
  { value: 0, prefix: "₹", label: "Pickup & delivery fee" },
  { value: 48, suffix: " hr", label: "Back at your door, or sooner" },
  { value: 30, suffix: " sec", label: "To book a pickup" },
  { value: 100, suffix: "%", label: "Of pieces counted with you at the door" },
];

export type Value = {
  title: string;
  description: string;
  icon: "heart-handshake" | "eye" | "badge-check";
};

export const ABOUT_VALUES: Value[] = [
  {
    title: "Crisp, every time",
    description: "Your clothes come back sharp, clean and ready to wear. Every piece, every order.",
    icon: "heart-handshake",
  },
  {
    title: "No guesswork",
    description: "Clear pricing. Clear updates. No surprises.",
    icon: "eye",
  },
  {
    title: "On time, as promised",
    description: "We pick up when we say and deliver when we say. No chasing needed.",
    icon: "badge-check",
  },
];

export type Testimonial = {
  quote: string;
  name: string;
  locality: string;
};

/** Shown under "Don't just take our word for it", so every quote here must be
 * a real customer's words, used with their permission. */
export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "The pickup was on time to the minute, and the invoice broke down every single item. First laundry service I've trusted with my work shirts.",
    name: "Ananya Rao",
    locality: "Barkatpura",
  },
  {
    quote:
      "Booked on WhatsApp, tracked the order the whole way, got a re-quote approval before anything changed. No guesswork at all.",
    name: "Vikram Shah",
    locality: "Himayatnagar",
  },
  {
    quote:
      "My sarees came back pressed and packed better than the store I used for ten years. Same-day express saved a wedding morning.",
    name: "Meera Iyer",
    locality: "Kacheguda",
  },
  {
    quote:
      "My sneakers looked showroom-fresh after their deep clean. Didn't expect that level of care from a laundry pickup service.",
    name: "Rohan Kapoor",
    locality: "Nallakunta",
  },
  {
    quote:
      "The tracking link is what sold me — I could see exactly which stage my order was at without calling anyone.",
    name: "Priya Menon",
    locality: "Basheerbagh",
  },
];

export type PricingPlan = {
  name: string;
  unit: string;
  /** null: the price is shown live as the customer adds items when booking. */
  startingAt: string | null;
  bullets: string[];
  highlighted: boolean;
  badge?: string;
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: "Ironing",
    unit: "per piece",
    startingAt: null,
    bullets: ["Shirts, trousers, kurtas, sarees", "Free pickup and delivery", "Back in 24–48 hours"],
    highlighted: true,
    badge: "Our hero",
  },
  {
    name: "Wash & Fold",
    unit: "per kg",
    startingAt: "₹79",
    bullets: ["Sorted by fabric", "Washed, dried and folded", "Packed fresh"],
    highlighted: false,
  },
  {
    name: "Dry Cleaning",
    unit: "per item",
    startingAt: "₹149",
    bullets: ["Safe for delicates", "Stains looked at on arrival", "Pressed and hung"],
    highlighted: false,
  },
];

export type Faq = {
  question: string;
  answer: string;
};

export const FAQS: Faq[] = [
  {
    question: "Is my ironing done by hand or by machine?",
    answer:
      "By machine. Professional automatic garment-pressing machines steam and press every piece, so the finish doesn't depend on who is holding the iron.",
  },
  {
    question: "What can I send for ironing?",
    answer:
      "Shirts, T-shirts, trousers, jeans, kurtas, sarees, bedsheets — the everyday pile. Add your items when you book and you'll see the price for each one before you confirm.",
  },
  {
    question: "How long does a regular order take?",
    answer:
      "Most orders are back at your door within 24–48 hours of pickup. Express orders picked up before the morning cut-off come back the same evening.",
  },
  {
    question: "Which areas do you pick up from?",
    answer:
      "We currently serve select apartments and pincodes across Hyderabad, with morning and evening slots. Enter your pincode on the booking page to see what's available near you.",
  },
  {
    question: "How do I know nothing goes missing?",
    answer:
      "Our rider counts every piece with you at the door, and the same count comes back to you. If anything doesn't add up, we stop and check with you before going any further.",
  },
  {
    question: "How do I pay?",
    answer:
      "Cash or UPI when your clothes come back, or from your IRON MAN credit if you have some. You'll see an itemised bill before delivery.",
  },
  {
    question: "What's the cut-off for same-day express?",
    answer:
      "Pickups before 9:00 AM can come back the same evening, depending on that day's slots. We'll confirm when you book.",
  },
  {
    question: "Do you offer monthly plans?",
    answer:
      "Not yet. Every order is priced on its own, with no commitment. We're working on plans for households who send clothes every week.",
  },
  {
    question: "What if something is damaged?",
    answer:
      "Tell us from your order's tracking page or call us, and our team will sort it out with you directly.",
  },
];
