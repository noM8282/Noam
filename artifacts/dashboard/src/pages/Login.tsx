import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TerminalSquare } from "lucide-react"

export function Login() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-xl border-border">
        <CardHeader className="space-y-4 items-center text-center">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <TerminalSquare className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold tracking-tight">Welcome to LuaBox</CardTitle>
            <CardDescription className="text-base">
              The professional control panel for script developers.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col space-y-4 pt-4">
          <Button 
            size="lg" 
            className="w-full font-medium"
            onClick={() => {
              window.location.href = "/api/auth/discord"
            }}
          >
            Log in with Discord
          </Button>
          <p className="text-xs text-center text-muted-foreground mt-4">
            By logging in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
