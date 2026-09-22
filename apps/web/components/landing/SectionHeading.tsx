export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
      <span className="text-sm font-semibold tracking-widest text-landing-gold uppercase">
        {eyebrow}
      </span>
      <h2 className="font-landing-heading text-4xl font-bold text-balance text-landing-gold">
        {title}
      </h2>
      {description && <p className="text-landing-muted">{description}</p>}
    </div>
  );
}
