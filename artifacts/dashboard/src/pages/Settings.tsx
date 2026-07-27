import { useGetMe, useLogout } from "@workspace/api-client-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { LogOut, User } from "lucide-react"

export function Settings() {
  const { data: user } = useGetMe()
  const logout = useLogout()

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        window.location.href = "/login"
      }
    })
  }

  if (!user) return null

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Discord Account</CardTitle>
          <CardDescription>The Discord account linked to your LuaBox profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            {user.avatar ? (
              <img 
                src={`https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`} 
                alt={user.username}
                className="h-16 w-16 rounded-full bg-muted object-cover border shadow-sm"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center text-primary border border-primary/30 shadow-sm">
                <User className="h-8 w-8" />
              </div>
            )}
            <div>
              <div className="text-xl font-bold">{user.username}</div>
              <div className="text-sm font-mono text-muted-foreground">{user.discordId}</div>
            </div>
          </div>

          <div className="grid gap-4 pt-4 border-t">
            <div className="grid gap-2">
              <Label>Username</Label>
              <Input value={user.username} readOnly disabled className="bg-muted/50 font-medium" />
            </div>
            <div className="grid gap-2">
              <Label>Account ID</Label>
              <Input value={user.id} readOnly disabled className="bg-muted/50 font-mono" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive-border">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Actions that cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleLogout} className="w-full sm:w-auto">
            <LogOut className="mr-2 h-4 w-4" /> Sign out everywhere
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
