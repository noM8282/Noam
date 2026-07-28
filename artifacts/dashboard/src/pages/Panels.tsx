import * as React from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  useListPanels,
  useCreatePanel,
  useDeletePanel,
  useSendPanel,
  useListScripts,
  useListBotGuilds,
  useListGuildChannels,
  getListPanelsQueryKey,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2, LayoutTemplate, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/utils"

// ── Create panel form ─────────────────────────────────────────────────────────
const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  scriptId: z.coerce.number().min(1, "Script is required"),
  description: z.string().optional(),
})

// ── Send panel form ───────────────────────────────────────────────────────────
const sendSchema = z.object({
  guildId: z.string().min(1, "Select a server"),
  channelId: z.string().min(1, "Select a channel"),
})

// ── Send dialog ───────────────────────────────────────────────────────────────
function SendPanelDialog({ panelId, panelName }: { panelId: number; panelName: string }) {
  const [open, setOpen] = React.useState(false)
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const sendPanel = useSendPanel()

  const form = useForm<z.infer<typeof sendSchema>>({
    resolver: zodResolver(sendSchema),
    defaultValues: { guildId: "", channelId: "" },
  })

  const selectedGuildId = form.watch("guildId")

  const { data: guilds, isLoading: guildsLoading } = useListBotGuilds({ query: { enabled: open } })
  const { data: channels, isLoading: channelsLoading } = useListGuildChannels(
    selectedGuildId,
    { query: { enabled: !!selectedGuildId } }
  )

  // Reset channel when guild changes
  React.useEffect(() => {
    form.setValue("channelId", "")
  }, [selectedGuildId, form])

  function onSend(values: z.infer<typeof sendSchema>) {
    sendPanel.mutate(
      { id: panelId, data: { channelId: values.channelId } },
      {
        onSuccess: () => {
          toast({ title: `Panel "${panelName}" sent to Discord!` })
          setOpen(false)
          form.reset()
          queryClient.invalidateQueries({ queryKey: getListPanelsQueryKey() })
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
          toast({ title: msg ?? "Failed to send panel", variant: "destructive" })
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Send to Discord">
          <Send className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Panel to Discord</DialogTitle>
          <DialogDescription>
            Choose a server and channel to post <strong>{panelName}</strong> as an interactive embed.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSend)} className="space-y-4">
            <FormField
              control={form.control}
              name="guildId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Server</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={guildsLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={guildsLoading ? "Loading servers…" : "Select a server"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {guilds?.length === 0 && (
                        <SelectItem value="_none" disabled>
                          No shared servers — invite the bot first
                        </SelectItem>
                      )}
                      {guilds?.map((g) => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="channelId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Channel</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!selectedGuildId || channelsLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            !selectedGuildId
                              ? "Select a server first"
                              : channelsLoading
                              ? "Loading channels…"
                              : "Select a channel"
                          }
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {channels?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>#{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={sendPanel.isPending}>
                {sendPanel.isPending ? "Sending…" : "Send Panel"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function Panels() {
  const { data: panels, isLoading: panelsLoading } = useListPanels()
  const { data: scripts, isLoading: scriptsLoading } = useListScripts()
  const createPanel = useCreatePanel()
  const deletePanel = useDeletePanel()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)

  const form = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", scriptId: 0, description: "" },
  })

  function onSubmit(values: z.infer<typeof createSchema>) {
    createPanel.mutate(
      { data: { ...values, scriptId: Number(values.scriptId) } },
      {
        onSuccess: () => {
          toast({ title: "Panel created" })
          setOpen(false)
          form.reset()
          queryClient.invalidateQueries({ queryKey: getListPanelsQueryKey() })
        },
        onError: () => {
          toast({ title: "Failed to create panel", variant: "destructive" })
        },
      }
    )
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this panel?")) return
    deletePanel.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Panel deleted" })
          queryClient.invalidateQueries({ queryKey: getListPanelsQueryKey() })
        },
      }
    )
  }

  if (panelsLoading || scriptsLoading) return <div>Loading…</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Panels</h1>
          <p className="text-muted-foreground mt-1">Discord embed panels for script access.</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" /> New Panel</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Panel</DialogTitle>
              <DialogDescription>
                Create a panel then use the <Send className="inline h-3 w-3" /> button to post it in Discord.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Panel Name</FormLabel>
                      <FormControl><Input placeholder="Main Purchase Panel" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description <span className="text-muted-foreground">(optional)</span></FormLabel>
                      <FormControl><Input placeholder="Shown in the Discord embed" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="scriptId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Script</FormLabel>
                      <Select onValueChange={(v) => field.onChange(v)} value={String(field.value || "")}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a script" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {scripts?.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createPanel.isPending}>
                    {createPanel.isPending ? "Creating…" : "Create Panel"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        {panels?.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <LayoutTemplate className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium">No panels yet</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Create a panel, then send it to a Discord channel.
            </p>
            <Button onClick={() => setOpen(true)} variant="outline">Create Panel</Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Script</TableHead>
                <TableHead>Last Sent</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {panels?.map((panel) => {
                const script = scripts?.find((s) => s.id === panel.scriptId)
                return (
                  <TableRow key={panel.id}>
                    <TableCell className="font-medium">{panel.name}</TableCell>
                    <TableCell>
                      {script
                        ? <Badge variant="outline">{script.name}</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {panel.channelId
                        ? <span className="text-xs">#{panel.channelId}</span>
                        : <span>Not sent yet</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(panel.createdAt)}</TableCell>
                    <TableCell className="text-right flex justify-end gap-1">
                      <SendPanelDialog panelId={panel.id} panelName={panel.name} />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(panel.id)}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}
