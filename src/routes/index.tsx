import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MapPin, Phone, UtensilsCrossed } from "lucide-react";
import heroMeal from "../assets/hero-meal.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vrindavan Meals — Fresh Wholesome Meals Every Day" },
      { name: "description", content: "Vrindavan Meals serves fresh, wholesome lunch and dinner to students across our canteen units. Quality food, student-focused, daily fresh meals." },
    ],
  }),
  component: Landing,
});


function scrollTo(id: string) {
  const el = document.querySelector(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "nav-scrolled bg-cream/95 backdrop-blur-md shadow-sm border-b border-brown/10"
          : "nav-top bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            scrollTo("#home");
          }}
          className="flex items-center gap-2.5"
        >
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-saffron to-terracotta grid place-items-center shadow-md">
            <UtensilsCrossed className="h-4 w-4 text-white" />
          </div>
          <span
            className={`font-[Playfair_Display] text-lg font-bold tracking-tight transition-colors duration-300 ${
              scrolled ? "text-[#c2410c]" : "text-white"
            }`}
          >
            Vrindavan Meals
          </span>
        </a>

        <Link
          to="/login"
          className="inline-flex items-center justify-center rounded-full bg-saffron px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-saffron/90 transition-all duration-300"
        >
          Login
        </Link>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section id="home" className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0">
        <img
          src={heroMeal}
          alt="Fresh Indian thali meal served by Vrindavan Meals"
          className="h-full w-full object-cover"
          width={1920}
          height={1080}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-brown/80 via-brown/60 to-brown/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-cream via-transparent to-transparent" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 pb-20 text-center">
        <span className="inline-block rounded-full bg-white/15 backdrop-blur-sm border border-white/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white mb-6">
          Student Canteen Service
        </span>
        <h1
          className="font-[Playfair_Display] text-5xl md:text-7xl font-bold text-[#FFFFFF] leading-tight max-w-4xl mx-auto"
          style={{ textShadow: "0 4px 24px rgba(0,0,0,0.55), 0 2px 10px rgba(0,0,0,0.65)" }}
        >
          Fresh, Wholesome Meals Every Day
        </h1>
        <p className="mt-6 text-lg md:text-xl text-white/90 max-w-2xl mx-auto leading-relaxed">
          Serving quality Lunch & Dinner to students across our canteen units —
          wholesome, hygienic, and made with care.
        </p>
        <div className="mt-10 flex items-center justify-center">
          <a
            href="#menu"
            onClick={(e) => {
              e.preventDefault();
              scrollTo("#menu");
            }}
            className="inline-flex items-center justify-center rounded-full bg-saffron px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-saffron/25 hover:bg-saffron/90 transition-colors"
          >
            Explore Our Menu
          </a>
        </div>
      </div>
    </section>
  );
}

function About() {
  const stats = [
    { value: "700+", label: "Students Served" },
    { value: "2", label: "Canteen Units" },
    { value: "Daily", label: "Fresh Meals" },
  ];

  return (
    <section id="about" className="py-20 md:py-28 bg-cream">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="text-saffron font-semibold text-sm uppercase tracking-wider">
              About Us
            </span>
            <h2 className="font-[Playfair_Display] text-4xl md:text-5xl font-bold text-brown mt-3 leading-tight">
              About Vrindavan Meals
            </h2>
            <p className="mt-6 text-lg text-brown/80 leading-relaxed">
              Vrindavan Meals is a student-focused canteen service built around one simple idea:
              every student deserves a wholesome, home-style meal. We prepare daily lunch and dinner
              with fresh ingredients, balanced nutrition, and the warmth of traditional Indian cooking.
            </p>
            <p className="mt-4 text-lg text-brown/80 leading-relaxed">
              From our kitchens to your canteen unit, we focus on quality, hygiene, and consistency —
              so students can focus on what matters most.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl bg-white p-6 shadow-sm border border-brown/10 text-center hover:shadow-md transition-shadow"
              >
                <div className="font-[Playfair_Display] text-4xl font-bold text-saffron">{stat.value}</div>
                <div className="mt-2 text-sm font-medium text-brown/70">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Menu() {
  const meals = [
    {
      emoji: "🍱",
      title: "Lunch",
      desc: "A hearty afternoon meal with rice, dal, seasonal vegetables, roti, and a fresh side — designed to keep students energised through the day.",
    },
    {
      emoji: "🍽️",
      title: "Dinner",
      desc: "A comforting evening thali with warm curries, fresh bread, rice, and a light side — the perfect end to a busy day of classes.",
    },
  ];

  return (
    <section id="menu" className="py-20 md:py-28 bg-warm-beige">
      <div className="max-w-7xl mx-auto px-6 text-center">
        <span className="text-saffron font-semibold text-sm uppercase tracking-wider">Our Menu</span>
        <h2 className="font-[Playfair_Display] text-4xl md:text-5xl font-bold text-brown mt-3">
          What We Serve
        </h2>
        <p className="mt-4 text-lg text-brown/70 max-w-2xl mx-auto">
          Simple, wholesome meal plans prepared fresh every day for our student canteens.
        </p>

        <div className="mt-14 grid md:grid-cols-2 gap-8">
          {meals.map((meal) => (
            <div
              key={meal.title}
              className="group rounded-2xl bg-white p-8 md:p-10 shadow-sm border border-brown/10 text-left hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              <div className="text-5xl mb-6">{meal.emoji}</div>
              <h3 className="font-[Playfair_Display] text-2xl md:text-3xl font-bold text-brown">{meal.title}</h3>
              <p className="mt-4 text-brown/75 leading-relaxed">{meal.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <section id="contact" className="py-20 md:py-28 bg-cream">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <span className="text-saffron font-semibold text-sm uppercase tracking-wider">Get in Touch</span>
          <h2 className="font-[Playfair_Display] text-4xl md:text-5xl font-bold text-brown mt-3">Contact</h2>
          <p className="mt-4 text-lg text-brown/70 max-w-2xl mx-auto">
            Reach out to learn more about meal plans and canteen partnerships.
          </p>
        </div>

        <div className="max-w-3xl mx-auto grid sm:grid-cols-2 gap-6">
          <div className="flex items-start gap-4 rounded-2xl bg-white p-6 shadow-sm border border-brown/10">
            <div className="h-11 w-11 rounded-full bg-saffron/10 grid place-items-center shrink-0">
              <MapPin className="h-5 w-5 text-saffron" />
            </div>
            <div>
              <div className="font-semibold text-brown">Address</div>
              <p className="mt-1 text-brown/70">
                Vrindavan Meals, Canteen Block,<br />
                Student Campus Area, India
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 rounded-2xl bg-white p-6 shadow-sm border border-brown/10">
            <div className="h-11 w-11 rounded-full bg-saffron/10 grid place-items-center shrink-0">
              <Phone className="h-5 w-5 text-saffron" />
            </div>
            <div>
              <div className="font-semibold text-brown">Phone</div>
              <p className="mt-1 text-brown/70">
                +91 98XXX XXXXX<br />
                <span className="text-sm text-brown/50">Mon – Sat, 9am – 7pm</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-brown text-white/80">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-center">
        <p className="text-sm">
          © 2026 Vrindavan Meals. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

function Landing() {
  return (
    <div className="bg-cream text-brown">
      <Navbar />
      <Hero />
      <About />
      <Menu />
      <Contact />
      <Footer />
    </div>
  );
}
