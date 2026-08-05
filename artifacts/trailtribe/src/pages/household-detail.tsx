import { useGetHousehold } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChevronLeft, Check, X, Phone, User, Home as HomeIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatPhone } from "@/lib/utils";

export default function HouseholdDetail() {
  const params = useParams();
  const householdId = parseInt(params.householdId || "0");

  const { data: household, isLoading } = useGetHousehold(householdId, {
    query: { queryKey: ['getHousehold', householdId], enabled: !!householdId }
  });

  if (isLoading) return <div className="p-8 text-center">Loading family details...</div>;
  if (!household) return <div className="p-8 text-center text-destructive">Household not found</div>;

  const isCompliant = household.liabilityWaiverSigned && household.mediaReleaseSigned && household.codeOfConductSigned;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <Link href="/roster" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4 mr-1" /> Back to Roster
      </Link>

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{household.name} Family</h1>
          {household.podId && <p className="text-muted-foreground mt-1">Pod: {household.podId}</p>}
        </div>
        {isCompliant ? (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700">Fully Compliant</Badge>
        ) : (
          <Badge variant="destructive">Action Required</Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Family Members</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Athletes</h3>
                <div className="space-y-3">
                  {household.members.filter(m => m.role === 'student').map(student => (
                    <div key={student.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-secondary/50 flex items-center justify-center">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-medium">{student.firstName} {student.lastName}</div>
                          <div className="text-xs text-muted-foreground">{student.grade ? `Grade ${student.grade}` : 'Student Athlete'}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Parents / Guardians</h3>
                <div className="space-y-3">
                  {household.members.filter(m => m.role === 'parent').map(parent => (
                    <div key={parent.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-secondary/50 flex items-center justify-center">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="font-medium">{parent.firstName} {parent.lastName}</div>
                          <div className="text-xs text-muted-foreground">{parent.email}</div>
                        </div>
                      </div>
                      {parent.phone && (
                        <a href={`tel:${parent.phone}`} className="text-primary hover:text-primary/80">
                          <Phone className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Compliance Status</CardTitle>
              <CardDescription>Required forms for the season</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <span>Liability Waiver</span>
                {household.liabilityWaiverSigned ? <Check className="h-4 w-4 text-green-500" /> : <X className="h-4 w-4 text-destructive" />}
              </div>
              <div className="flex items-center justify-between">
                <span>Media Release</span>
                {household.mediaReleaseSigned ? <Check className="h-4 w-4 text-green-500" /> : <X className="h-4 w-4 text-destructive" />}
              </div>
              <div className="flex items-center justify-between">
                <span>Code of Conduct</span>
                {household.codeOfConductSigned ? <Check className="h-4 w-4 text-green-500" /> : <X className="h-4 w-4 text-destructive" />}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {household.address && (
                <div className="flex items-start gap-2">
                  <HomeIcon className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <span>{household.address}</span>
                </div>
              )}
              {household.emergencyContactName && (
                <div className="pt-2 border-t">
                  <span className="text-muted-foreground text-xs block mb-1">Emergency Contact</span>
                  <div className="font-medium">{household.emergencyContactName}</div>
                  <div>{formatPhone(household.emergencyContactPhone)}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
