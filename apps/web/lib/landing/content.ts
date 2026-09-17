/** All landing-page copy lives here so it can be edited without touching
 * any component. Types are the shape each section component expects. */

export const NAV_LINKS = [
  { label: "Home", href: "#home" },
  { label: "Services", href: "#services" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "#contact" },
] as const;

export const CONTACT_PHONE = "+91 98765 43210";
export const CONTACT_PHONE_TEL = "+919876543210";
export const CONTACT_EMAIL = "hello@ironman.example";
export const CONTACT_ADDRESS = "12 Church Street, Koramangala, Bengaluru 560095";
export const CONTACT_HOURS = "Mon–Sat, 8:00 AM – 9:00 PM";

export type Service = {
  slug: string;
  title: string;
  description: string;
};

export const SERVICES: Service[] = [
  {
    slug: "dry-cleaning",
    title: "Premium Dry Cleaning",
    description: "Gentle solvent care for suits, silks and delicate fabrics.",
  },
  {
    slug: "wash-fold",
    title: "Wash & Fold",
    description: "Everyday laundry, sorted, washed, folded and packed fresh.",
  },
  {
    slug: "designer-garment",
    title: "Designer Garment Care",
    description: "Specialist handling for luxury labels and occasion wear.",
  },
  {
    slug: "shoe-sneaker",
    title: "Shoe & Sneaker Care",
    description: "Deep cleaning and restoration for sneakers and leather.",
  },
  {
    slug: "saree-drapery",
    title: "Saree & Drapery Care",
    description: "Pressed, polished and packed with heritage-grade care.",
  },
  {
    slug: "express",
    title: "Express Same-Day",
    description: "In by morning, back by evening. When you need it fast.",
  },
];

export type NumberedFeature = {
  number: string;
  title: string;
  description: string;
};

export const NUMBERED_FEATURES: NumberedFeature[] = [
  {
    number: "01",
    title: "Free Doorstep Pickup",
    description: "Schedule in 30 seconds. We collect from your home or office at a slot you choose.",
  },
  {
    number: "02",
    title: "Trained Garment Specialists",
    description:
      "Fabric-first assessment on intake; every item tagged and tracked through our system.",
  },
  {
    number: "03",
    title: "Transparent Billing",
    description: "Itemized digital invoice from our in-house software. No surprises, ever.",
  },
  {
    number: "04",
    title: "Same-Day Express",
    description: "Cut-off aware routing so urgent orders return the same evening.",
  },
];

export type Step = {
  title: string;
  description: string;
};

export const HOW_IT_WORKS: Step[] = [
  { title: "Schedule Pickup", description: "Book a slot on the web or WhatsApp in under a minute." },
  { title: "We Clean & Press", description: "Tracked from intake through pressing and quality check." },
  { title: "Delivered Fresh", description: "Back at your door, pay by cash or UPI on delivery." },
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
    locality: "Koramangala",
  },
  {
    quote:
      "Booked on WhatsApp, tracked the order the whole way, got a re-quote approval before anything changed. No guesswork at all.",
    name: "Vikram Shah",
    locality: "Indiranagar",
  },
  {
    quote:
      "My sarees came back pressed and packed better than the store I used for ten years. Same-day express saved a wedding morning.",
    name: "Meera Iyer",
    locality: "HSR Layout",
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
      "We currently serve select apartments and pincodes across Bengaluru, with morning and evening pickup slots. Enter your pincode on the booking page to see live availability for your area.",
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
];
