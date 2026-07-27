import { 
  useListServers, 
  useDisconnectServer,
  getListServersQueryKey 
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Server, Unplug } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/utils"

export function Servers() {
  const { data: servers, isLoading } = useListServers()
  const disconnectServer = useDisconnectServer()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  function handleDisconnect(id: number) {
    if (!confirm("Are you sure you want to disconnect this server? Bot features will stop working.")) return
    disconnectServer.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Server disconnected" })
          queryClient.invalidateQueries({ queryKey: getListServersQueryKey() })
        },
        onError: () => {
          toast({ title: "Failed to disconnect", variant: "destructive" })
        }
      }
    )
  }

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Connected Servers</h1>
        <p className="text-muted-foreground mt-1">Manage Discord guilds where your bot is installed.</p>
      </div>

      <Card>
        {servers?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Server className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium">No servers connected</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-md">
              Your bot is not installed in any servers yet. Invite the bot to your Discord server to start using panels.
            </p>
            <Button variant="outline" onClick={() => window.open("/api/bot/invite", "_blank")}>
              Invite Bot to Server
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Server Name</TableHead>
                <TableHead>Guild ID</TableHead>
                <TableHead>Connected On</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers?.map((server) => (
                <TableRow key={server.id}>
                  <TableCell className="font-medium">{server.name}</TableCell>
                  <TableCell className="font-mono text-sm">{server.guildId}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(server.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleDisconnect(server.id)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Unplug className="mr-2 h-4 w-4" /> Disconnect
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
