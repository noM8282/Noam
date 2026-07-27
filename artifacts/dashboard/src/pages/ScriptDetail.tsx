import * as React from "react"
import { useParams, Link } from "wouter"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { 
  useGetScript, 
  useUpdateScript,
  useListWhitelist,
  useAddToWhitelist,
  useRemoveFromWhitelist,
  getGetScriptQueryKey,
  getListWhitelistQueryKey
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Save, Plus, Trash2, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/utils"

const updateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  version: z.string().min(1, "Version is required"),
})

export function ScriptDetail() {
  const params = useParams()
  const scriptId = Number(params.id)
  
  const { data: script, isLoading: scriptLoading } = useGetScript(scriptId, {
    query: { enabled: !!scriptId }
  })
  const { data: whitelist, isLoading: whitelistLoading } = useListWhitelist(scriptId, {
    query: { enabled: !!scriptId }
  })
  
  const updateScript = useUpdateScript()
  const addWhitelist = useAddToWhitelist()
  const removeWhitelist = useRemoveFromWhitelist()
  
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const form = useForm<z.infer<typeof updateSchema>>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      name: "",
      description: "",
      version: "",
    },
  })

  // Watch for data load and reset form
  React.useEffect(() => {
    if (script) {
      form.reset({
        name: script.name,
        description: script.description || "",
        version: script.version,
      })
    }
  }, [script, form])

  function onUpdateSubmit(values: z.infer<typeof updateSchema>) {
    updateScript.mutate(
      { id: scriptId, data: values },
      {
        onSuccess: () => {
          toast({ title: "Script updated successfully" })
          queryClient.invalidateQueries({ queryKey: getGetScriptQueryKey(scriptId) })
        },
        onError: () => {
          toast({ title: "Failed to update script", variant: "destructive" })
        }
      }
    )
  }

  const [newDiscordId, setNewDiscordId] = React.useState("")

  function handleAddWhitelist(e: React.FormEvent) {
    e.preventDefault()
    if (!newDiscordId) return

    addWhitelist.mutate(
      { id: scriptId, data: { discordUserId: newDiscordId } },
      {
        onSuccess: () => {
          toast({ title: "User whitelisted" })
          setNewDiscordId("")
          queryClient.invalidateQueries({ queryKey: getListWhitelistQueryKey(scriptId) })
        },
        onError: () => {
          toast({ title: "Failed to whitelist user", variant: "destructive" })
        }
      }
    )
  }

  function handleRemoveWhitelist(userId: string) {
    if (!confirm("Remove this user from whitelist?")) return
    removeWhitelist.mutate(
      { id: scriptId, discordUserId: userId },
      {
        onSuccess: () => {
          toast({ title: "User removed from whitelist" })
          queryClient.invalidateQueries({ queryKey: getListWhitelistQueryKey(scriptId) })
        }
      }
    )
  }

  if (scriptLoading || !script) return <div>Loading...</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="shrink-0">
          <Link href="/scripts">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{script.name}</h1>
          <p className="text-muted-foreground mt-1">Manage script settings and access.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant={script.status === 'active' ? 'success' : 'secondary'} className="text-sm px-3 py-1">
            {script.status.toUpperCase()}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Update the basic details of your script.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onUpdateSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="version"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Version</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={updateScript.isPending}>
                  <Save className="mr-2 h-4 w-4" /> 
                  {updateScript.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Whitelist
            </CardTitle>
            <CardDescription>Manually grant access to specific Discord users.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleAddWhitelist} className="flex gap-2">
              <Input 
                placeholder="Discord User ID" 
                value={newDiscordId} 
                onChange={(e) => setNewDiscordId(e.target.value)} 
              />
              <Button type="submit" disabled={!newDiscordId || addWhitelist.isPending}>
                <Plus className="mr-2 h-4 w-4" /> Add
              </Button>
            </form>

            <div className="border rounded-md mt-4 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Discord ID</TableHead>
                    <TableHead>Added On</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {whitelist?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground h-24">
                        No whitelisted users
                      </TableCell>
                    </TableRow>
                  ) : (
                    whitelist?.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-sm">{entry.discordUserId}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(entry.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleRemoveWhitelist(entry.discordUserId)}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 w-8"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
