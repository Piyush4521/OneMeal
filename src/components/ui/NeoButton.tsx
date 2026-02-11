import { motion, type HTMLMotionProps } from "framer-motion";

interface NeoButtonProps extends HTMLMotionProps<"button"> {
  variant?: "primary" | "secondary" | "danger";
}

export const NeoButton = ({ children, variant = "primary", className, ...props }: NeoButtonProps) => {
  const bgColors = {
    primary: "bg-primary text-dark",    
    secondary: "bg-white text-dark",    
    danger: "bg-accent text-white",     
  };

  return (
    <motion.button
      whileHover={{ y: -2, x: -2, boxShadow: "6px 6px 0px 0px rgba(0,0,0,1)" }}
      whileTap={{ y: 2, x: 2, boxShadow: "2px 2px 0px 0px rgba(0,0,0,1)" }}
      className={`
        ${bgColors[variant]} 
        border-2 border-dark rounded-xl px-6 py-3 font-bold text-lg
        shadow-neo transition-all flex items-center gap-2 justify-center
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dark focus-visible:ring-offset-2
        ${className || ""}
      `}
      {...props}
    >
      {children}
    </motion.button>
  );
};
