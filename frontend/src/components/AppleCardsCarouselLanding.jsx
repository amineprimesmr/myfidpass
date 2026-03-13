/**
 * Apple Cards Carousel — intégration landing Myfidpass
 * Utilise les 6 images du carousel existant
 */
import React from "react";
import { Carousel, Card } from "./ui/apple-cards-carousel.jsx";

const CARDS = [
  {
    src: "/assets/caroussel/miecaline.png",
    title: "Mie Caline",
    category: "Boulangerie",
    content: "Cartes fidélité tampons pour vos clients. Faites revenir les habitués avec un système simple et efficace.",
  },
  {
    src: "/assets/caroussel/nike.png",
    title: "Nike",
    category: "Sport",
    content: "Points à chaque achat, offres exclusives. Fidélisez vos clients avec un programme de récompenses moderne.",
  },
  {
    src: "/assets/caroussel/tastycrousty.png",
    title: "Tasty Crousty",
    category: "Restauration",
    content: "Tampons ou points, au choix. Un QR code à scanner et la carte s'ajoute sur le téléphone du client.",
  },
  {
    src: "/assets/caroussel/sephora.png",
    title: "Sephora",
    category: "Beauté",
    content: "Cumulez des avantages à chaque visite. Votre carte fidélité dans Apple Wallet et Google Wallet.",
  },
  {
    src: "/assets/caroussel/gladalle.png",
    title: "G La Dalle",
    category: "Street food",
    content: "Fidélité sans prise de tête. Créez votre carte en quelques clics, partagez le lien à vos clients.",
  },
  {
    src: "/assets/caroussel/kazdal.png",
    title: "Kazdal",
    category: "Commerce",
    content: "Le meilleur moyen de faire revenir vos clients. Tous secteurs, tous commerces.",
  },
];

export default function AppleCardsCarouselLanding() {
  const items = CARDS.map((card, index) => (
    <Card key={index} card={card} index={index} />
  ));

  return (
    <div className="w-full py-8">
      <h2 className="text-2xl md:text-3xl font-bold text-center text-neutral-800 dark:text-neutral-200 mb-10 px-4">
        Exemples de cartes par secteur
      </h2>
      <Carousel items={items} />
    </div>
  );
}

export async function mountAppleCardsCarousel() {
  const { createRoot } = await import("react-dom/client");
  const root = document.getElementById("landing-apple-carousel-root");
  if (!root) return;
  const { default: AppleCardsCarouselLanding } = await import("./AppleCardsCarouselLanding.jsx");
  createRoot(root).render(<AppleCardsCarouselLanding />);
}
