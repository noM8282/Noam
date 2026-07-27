import * as React from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { 
  useListPanels, 
  useCreatePanel, 
  useDeletePanel, 
  useListScripts, 
  useListServers,
  getListPanelsQueryKey 
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2, LayoutTemplate } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/utils"

const panelSchema = z.object({
  name: z.string().min(1, "Name is required"),
  scriptId: z.coerce.number().min(1, "Script is required"),
  discordServerId: z.string().optional(),
  channelId: z.string().optional(),
})

export function Panels() {
  const { data: panels, isLoading: panelsLoading } = useListPanels()
  const { data: scripts, isLoading: scriptsLoading } = useListScripts()
  const { data: servers, isLoading: serversLoading } = useListServers()
  const createPanel = useCreatePanel()
  const deletePanel = useDeletePanel()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)

  const form = useForm<z.infer<typeof panelSchema>>({
    resolver: zodResolver(panelSchema),
    defaultValues: {
      name: "",
      scriptId: 0,
      discordServerId: "",
      channelId: "",
    },
  })

  function onSubmit(values: z.infer<typeof panelSchema>) {
    createPanel.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: "Panel created successfully" })
          setOpen(false)
          form.reset()
          queryClient.invalidateQueries({ queryKey: getListPanelsQueryKey() })
        },
        onError: () => {
          toast({ title: "Failed to create panel", variant: "destructive" })
        }
      }
    )
  }

  function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this panel?")) return
    deletePanel.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Panel deleted" })
          queryClient.invalidateQueries({ queryKey: getListPanelsQueryKey() })
        }
      }
    )
  }

  if (panelsLoading || scriptsLoading || serversLoading) return <div>Loading...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Panels</h1>
          <p className="text-muted-foreground mt-1">Discord panels for user access.</p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> New Panel
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Panel</DialogTitle>
              <DialogDescription>
                Create a new Discord bot panel for users to interact with your scripts.
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
                  name="scriptId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Script</FormLabel>
                      <Select onValueChange={(val) => field.onChange(val)} value={String(field.value || "")}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a script" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {scripts?.map(s => (
                            <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="discordServerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Discord Server (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select connected server" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {servers?.map(s => (
                            <SelectItem key={s.id} value={s.guildId}>{s.name}</SelectItem>
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
                      <FormLabel>Channel ID (Optional)</FormLabel>
                      <FormControl><Input placeholder="1234567890" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="submit" disabled={createPanel.isPending}>
                    {createPanel.isPending ? "Creating..." : "Create Panel"}
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
              Create a panel to let users purchase or access your scripts via Discord.
            </p>
            <Button onClick={() => setOpen(true)} variant="outline">
              Create Panel
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Script</TableHead>
                <TableHead>Server</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {panels?.map((panel) => {
                const script = scripts?.find(s => s.id === panel.scriptId)
                const server = servers?.find(s => s.guildId === panel.discordServerId)
                return (
                  <TableRow key={panel.id}>
                    <TableCell className="font-medium">{panel.name}</TableCell>
                    <TableCell>
                      {script ? <Badge variant="outline">{script.name}</Badge> : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      {server ? server.name : <span className="text-muted-foreground">Not bound</span>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(panel.createdAt)}</TableCell>
                    <TableCell className="text-right">
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
