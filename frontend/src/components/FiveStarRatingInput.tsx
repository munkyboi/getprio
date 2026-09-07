import { Group, UnstyledButton } from "@mantine/core";
import { IconStarFilled } from "@tabler/icons-react";

export default function FiveStarRatingInput({ value, onChange, label = "Rating" }: { value: number; onChange: (value: number) => void; label?: string }) {
  return <Group aria-label={label} gap={6} role="radiogroup">{[1, 2, 3, 4, 5].map((star) => <UnstyledButton aria-checked={value === star} aria-label={`${star} star${star === 1 ? "" : "s"}`} className="rating-star-button" key={star} onClick={() => onChange(star)} role="radio"><IconStarFilled className={star <= value ? "rating-star rating-star--active" : "rating-star"} size={34}/></UnstyledButton>)}</Group>;
}
