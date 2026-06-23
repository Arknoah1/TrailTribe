import { useListHouseholds, useListPods, useListUsers } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, User, CheckCircle2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PodBadgeShape, EmptyTrailState } from "@/components/illustrations";

export default function Roster() {
  const { data: pods, isLoading: isLoadingPods } = useListPods();
  const { data: households, isLoading: isLoadingHouseholds } = useListHouseholds();
  const { data: coaches, isLoading: isLoadingCoaches } = useListUsers({ role: "coach" });

  if (isLoadingPods || isLoadingHouseholds || isLoadingCoaches) {
    return <div className="p-8 text-center">Loading roster...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pt-4 md:pt-8">

      <div className="px-6 md:px-8 space-y-8">
      <div>
        <h1 className="font-display text-4xl tracking-widest text-foreground leading-none">Team Roster</h1>
        <p className="text-muted-foreground mt-1 text-sm">Directory of all athletes, parents, and coaches.</p>
      </div>

      <div className="space-y-8">
        {pods?.map(pod => {
          const podHouseholds = households?.filter(h => h.podId === pod.id.toString()) || [];
          const podCoaches = coaches?.filter(c => c.podId === pod.id.toString()) || [];

          return (
            <div key={pod.id} className="space-y-4">
              <div className="flex items-center gap-3 border-b-2 border-[#0a0c10] pb-3">
                <div className="relative w-8 h-8 shrink-0">
                  <PodBadgeShape color={pod.color || 'hsl(174 100% 38%)'} className="w-8 h-8" />
                </div>
                <h2 className="font-display text-3xl tracking-wider leading-none">{pod.name}</h2>
              </div>

              {podCoaches.length > 0 && (
                <div className="bg-muted/30 rounded-lg p-4 mb-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center">
                    <ShieldAlert className="h-4 w-4 mr-2" /> Coaches
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {podCoaches.map(coach => (
                      <div key={coach.id} className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                          {coach.firstName[0]}{coach.lastName[0]}
                        </div>
                        <div>
                          <div className="font-medium">{coach.firstName} {coach.lastName}</div>
                          {coach.phone && <div className="text-xs text-muted-foreground">{coach.phone}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {podHouseholds.map(household => {
                  const isCompliant = household.liabilityWaiverSigned && household.mediaReleaseSigned && household.codeOfConductSigned;
                  return (
                    <Link key={household.id} href={`/roster/${household.id}`}>
                      <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
                        <CardHeader className="pb-2">
                          <div className="flex justify-between items-start">
                            <CardTitle className="text-lg">{household.name} Family</CardTitle>
                            {isCompliant ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">Incomplete</Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Students</div>
                              {household.members.filter(m => m.role === 'student').map(student => (
                                <div key={student.id} className="flex items-center text-sm">
                                  <User className="h-3 w-3 mr-2 text-muted-foreground" />
                                  {student.firstName} {student.lastName} {student.grade ? `(Gr ${student.grade})` : ''}
                                </div>
                              ))}
                            </div>
                            <div className="space-y-1 pt-2 border-t">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Parents</div>
                              {household.members.filter(m => m.role === 'parent').map(parent => (
                                <div key={parent.id} className="flex items-center justify-between text-sm">
                                  <span>{parent.firstName} {parent.lastName}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
              {podHouseholds.length === 0 && (
                <EmptyTrailState message="No families in this pod yet." className="py-8" />
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
