/** All landing-page copy lives here so it can be edited without touching
 * any component. Types are the shape each section component expects. */

export const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "Services", href: "#services" },
  { label: "Process", href: "#process" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
] as const;

export const CONTACT_PHONE = "+91 98765 43210";
export const CONTACT_PHONE_TEL = "+919876543210";
export const CONTACT_EMAIL = "hello@ironman.example";
export const CONTACT_ADDRESS = "Barkatpura, Kacheguda, Hyderabad, Telangana 500027";
export const CONTACT_HOURS = "Mon–Sat, 8:00 AM – 9:00 PM";
export const CONTACT_INSTAGRAM =
  "https://www.instagram.com/ironmanhyderabad?stkn=MW1qd2tpZm1tMTMyaQ==";

export type Service = {
  slug: string;
  title: string;
  description: string;
  bullets: [string, string];
};

export const SERVICES: Service[] = [
  {
    slug: "dry-cleaning",
    title: "Premium Dry Cleaning",
    description: "Gentle solvent care for suits, silks and delicate fabrics.",
    bullets: ["Fabric-tested solvent process", "Pressed and hung ready to wear"],
  },
  {
    slug: "wash-fold",
    title: "Wash & Fold",
    description: "Everyday laundry, sorted, washed, folded and packed fresh.",
    bullets: ["Sorted by colour and fabric", "Folded and packed in labelled bags"],
  },
  {
    slug: "designer-garment",
    title: "Designer Garment Care",
    description: "Specialist handling for luxury labels and occasion wear.",
    bullets: ["Hand-finished, label-safe pressing", "Priority handling for occasion wear"],
  },
  {
    slug: "shoe-sneaker",
    title: "Shoe & Sneaker Care",
    description: "Deep cleaning and restoration for sneakers and leather.",
    bullets: ["Sole, upper and lace deep-clean", "Leather conditioning on request"],
  },
  {
    slug: "saree-drapery",
    title: "Saree & Drapery Care",
    description: "Pressed, polished and packed with heritage-grade care.",
    bullets: ["Zari and border-safe pressing", "Folded flat, never creased in transit"],
  },
  {
    slug: "express",
    title: "Express Same-Day",
    description: "In by morning, back by evening. When you need it fast.",
    bullets: ["Morning cut-off, evening delivery", "Priority queue at the hub"],
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
    title: "Free Doorstep Pickup",
    description: "Schedule in 30 seconds. We collect from your home or office at a slot you choose.",
    icon: "truck",
  },
  {
    number: "02",
    title: "Trained Garment Specialists",
    description:
      "Fabric-first assessment on intake; every item tagged and tracked through our system.",
    icon: "shield",
  },
  {
    number: "03",
    title: "Transparent Billing",
    description: "Itemized digital invoice from our in-house software. No surprises, ever.",
    icon: "receipt",
  },
  {
    number: "04",
    title: "Same-Day Express",
    description: "Cut-off aware routing so urgent orders return the same evening.",
    icon: "zap",
  },
  {
    number: "05",
    title: "Real-Time Order Tracking",
    description: "A live tracking link follows your order from pickup to delivery — no app required.",
    icon: "map-pin",
  },
  {
    number: "06",
    title: "Book On Web Or WhatsApp",
    description: "Schedule from a browser or straight from a WhatsApp chat — whichever is faster for you.",
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
    title: "Schedule Pickup",
    description:
      "Book a slot on the web or WhatsApp in under a minute. Pick a window that suits your day — we work around you.",
    icon: "calendar",
  },
  {
    title: "We Collect & Tag",
    description:
      "Every item is counted with you at the door, tagged and logged into our system before it ever leaves your hands.",
    icon: "clipboard-check",
  },
  {
    title: "Wash, Press & Quality Check",
    description:
      "Fabric-first handling through wash, press and a final quality check — tracked stage by stage, not left to guesswork.",
    icon: "sparkles",
  },
  {
    title: "Packed & Invoiced",
    description:
      "An itemized digital invoice is generated before we pack — you see exactly what you're paying for, before delivery day.",
    icon: "receipt",
  },
  {
    title: "Delivered Fresh",
    description:
      "Back at your door on schedule. Pay by cash or UPI, or draw down your IronMan store credit if you have a balance.",
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

export const IMPACT_STATS: ImpactStat[] = [
  { value: 10000, suffix: "+", label: "Garments cared for" },
  { value: 4.9, decimals: 1, suffix: "/5", label: "Average customer rating" },
  { value: 48, suffix: "hr", label: "Standard turnaround" },
  { value: 30, suffix: "sec", label: "Average booking time" },
];

export type Value = {
  title: string;
  description: string;
  icon: "heart-handshake" | "eye" | "badge-check";
};

export const ABOUT_VALUES: Value[] = [
  {
    title: "Care first",
    description: "Every garment gets a fabric-first assessment before it touches a machine.",
    icon: "heart-handshake",
  },
  {
    title: "Radical transparency",
    description: "You see the same itemized invoice and order timeline our own team works from.",
    icon: "eye",
  },
  {
    title: "Built to be trusted",
    description: "Counted at intake, tracked at every stage, confirmed with you before anything changes.",
    icon: "badge-check",
  },
];

export type Testimonial = {
  quote: string;
  name: string;
  locality: string;
};

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
  {
    quote:
      "Switched from a local dhobi after one bad stain job elsewhere. IronMan's quality check step actually caught an issue before delivery.",
    name: "Arjun Nair",
    locality: "Narayanguda",
  },
];

export type PricingPlan = {
  name: string;
  unit: string;
  startingAt: string;
  bullets: string[];
  highlighted: boolean;
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    name: "Wash & Fold",
    unit: "per kg",
    startingAt: "₹79",
    bullets: ["Sorted by fabric type", "Washed, dried and folded", "Packed in labelled bags"],
    highlighted: false,
  },
  {
    name: "Dry Cleaning",
    unit: "per item",
    startingAt: "₹149",
    bullets: ["Solvent-safe for delicates", "Stain assessment on intake", "Pressed and hung ready"],
    highlighted: true,
  },
  {
    name: "Premium Care",
    unit: "per item",
    startingAt: "₹299",
    bullets: ["Designer & occasion wear", "Hand-finished pressing", "Priority same-day slot"],
    highlighted: false,
  },
];

export type Faq = {
  question: string;
  answer: string;
};

export const FAQS: Faq[] = [
  {
    question: "Which areas do you pick up from, and what slots are available?",
    answer:
      "We currently serve select apartments and pincodes across Hyderabad, with morning and evening pickup slots. Enter your pincode on the booking page to see live availability for your area.",
  },
  {
    question: "How long does a regular order take?",
    answer:
      "Most wash & fold and dry-cleaning orders are ready within 24–48 hours of pickup. Express orders picked up before the morning cut-off are delivered the same evening.",
  },
  {
    question: "How do you make sure my garments are safe?",
    answer:
      "Every garment is counted with you at pickup, tagged, and tracked through wash, press and quality check in our system. If a count doesn't match what was declared, we pause the order and get your approval before continuing.",
  },
  {
    question: "How do I pay?",
    answer:
      "Cash or UPI at the time of delivery, or from your IronMan store credit if you have a balance. You'll always get an itemized digital invoice first.",
  },
  {
    question: "What's the cut-off for same-day express?",
    answer:
      "Pickups completed before 9:00 AM qualify for same-evening express delivery, subject to that day's slots. We'll confirm express eligibility when you book.",
  },
  {
    question: "Do you offer any subscription or monthly plans?",
    answer:
      "Not yet — every order today is billed individually against our live rate card, with no recurring commitment. We're evaluating monthly plans for regular households as we grow.",
  },
  {
    question: "What happens if an item is lost or damaged?",
    answer:
      "Every garment is counted and tagged at intake, so a discrepancy is caught early rather than at delivery. If something does go wrong, tell us on the order's tracking page or by phone and our team will work through it with you directly.",
  },
];
