"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { whatsappLink } from "@/lib/whatsapp";
import WhatsAppIcon from "./WhatsAppIcon";

/** Always-reachable WhatsApp shortcut. Appears after the hero so it doesn't
 *  compete with the hero CTAs, and hides while the calculator's own order
 *  button is on screen (one green button at a time). */
export default function FloatingWhatsApp() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const calc = document.getElementById("calculator");
    let calcInView = false;
    const io = calc
      ? new IntersectionObserver(([e]) => {
          calcInView = e.isIntersecting;
          update();
        }, { threshold: 0.25 })
      : null;
    if (calc && io) io.observe(calc);

    function update() {
      setVisible(window.scrollY > 500 && !calcInView);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      io?.disconnect();
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.a
          initial={{ opacity: 0, scale: 0.6, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.6, y: 20 }}
          transition={{ type: "spring", stiffness: 380, damping: 26 }}
          href={whatsappLink("السلام عليكم 👋\nعندي استفسار عن تحويل.")}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="تواصل عبر واتساب"
          className="btn-whatsapp fixed bottom-5 left-5 z-50 size-14 !rounded-full"
        >
          <WhatsAppIcon size={28} />
        </motion.a>
      )}
    </AnimatePresence>
  );
}
