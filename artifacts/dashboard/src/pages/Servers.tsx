import * as React from "react"
import {
  useListServers,
  useDisconnectServer,
  useSyncServers,
  useGetBotInvite,
  getListServersQueryKey,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Server, Unplug, RefreshCw, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/utils"

export function Servers() {
  const { data: servers, isLoading } = useListServers()
  const { data: inviteData } = useGetBotInvite()
  const disconnectServer = useDisconnectServer()
  const syncServers = useSyncServers()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  function handleDisconnect(id: number) {
    if (!confirm("Disconnect this server? Bot features will stop working there.")) return
    disconnectServer.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Server disconnected" })
          queryClient.invalidateQueries({ queryKey: getListServersQueryKey() })
        },
        onError: () => {
          toast({ title: "Failed to disconnect", variant: "destructive" })
        },
      }
    )
  }

  function handleSync() {
    syncServers.mutate(undefined, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListServersQueryKey() })
        if (data.synced === 0) {
          toast({ title: `All ${data.total} server${data.total !== 1 ? "s" : ""} already synced` })
        } else {
          toast({ title: `Synced ${data.synced} new server${data.synced !== 1 ? "s" : ""}` })
        }
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        toast({ title: msg ?? "Failed to sync servers", variant: "destructive" })
      },
    })
  }

  if (isLoading) return <div>Loading…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Connected Servers</h1>
          <p className="text-muted-foreground mt-1">Discord guilds where your bot is installed.</p>
        </div>
        <div className="flex gap-2">
          {inviteData?.url && (
            <Button variant="outline" onClick={() => window.open(inviteData.url, "_blank")}>
              <ExternalLink className="mr-2 h-4 w-4" /> Invite Bot
            </Button>
          )}
          <Button onClick={handleSync} disabled={syncServers.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncServers.isPending ? "animate-spin" : ""}`} />
            {syncServers.isPending ? "Syncing…" : "Sync Servers"}
          </Button>
        </div>
      </div>

      <Card>
        {servers?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Server className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium">No servers connected</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-md">
              Invite the bot to your Discord server, then click <strong>Sync Servers</strong> to import it here.
            </p>
            <div className="flex gap-3 flex-wrap justify-center">
              {inviteData?.url && (
                <Button onClick={() => window.open(inviteData.url, "_blank")}>
                  <ExternalLink className="mr-2 h-4 w-4" /> Invite Bot to Server
                </Button>
              )}
              <Button variant="outline" onClick={handleSync} disabled={syncServers.isPending}>
                <RefreshCw className={`mr-2 h-4 w-4 ${syncServers.isPending ? "animate-spin" : ""}`} />
                {syncServers.isPending ? "Syncing…" : "Sync Servers"}
              </Button>
            </div>
          </div>
        ) : (
          <>
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
                    <TableCell className="font-mono text-sm text-muted-foreground">{server.guildId}</TableCell>
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
          </>
        )}
      </Card>
    </div>
  )
}
