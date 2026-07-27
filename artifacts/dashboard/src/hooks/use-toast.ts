import { toast as sonnerToast } from "sonner"

// Use sonner under the hood but keep the useToast export signature for compatibility
export const useToast = () => {
  return {
    toast: ({ title, description, variant }: { title: string, description?: string, variant?: "default" | "destructive" }) => {
      if (variant === "destructive") {
        sonnerToast.error(title, { description })
      } else {
        sonnerToast(title, { description })
      }
    }
  }
}

export const toast = ({ title, description, variant }: { title: string, description?: string, variant?: "default" | "destructive" }) => {
  if (variant === "destructive") {
    sonnerToast.error(title, { description })
  } else {
    sonnerToast(title, { description })
  }
}
