'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { AppShell } from '@/components/layout/AppShell';
import {
  FolderKanban,
  Calendar,
  Users,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Target
} from 'lucide-react';

export default function ProjectsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'plan' | 'apply' | 'reflect'>('plan');

  const projects = [
    {
      id: 'dpi-rollout',
      name: 'Karnataka DPI Rollout',
      client: 'State Government',
      phase: 'Implementation',
      priority: 'high',
      nextMeeting: {
        title: 'Finance Secretary Coordination',
        date: 'Tomorrow, 10:00 AM',
        participants: ['Finance Secretary', 'IT Dept Head', 'Minister\'s Office'],
        stakes: 'Budget approval decision'
      },
      stakeholders: [
        { name: 'Finance Secretary', power: 95, support: 35, trend: 'declining' },
        { name: 'IT Department Head', power: 45, support: 85, trend: 'stable' },
        { name: 'Minister', power: 100, support: 65, trend: 'impatient' }
      ],
      weeklyPlan: {
        appliedFrameworks: ['Stakeholder Mapping Protocol'],
        plannedFrameworks: ['Power Dynamic Analysis'],
        keyOutcomes: [
          'Secure Finance buy-in before Cabinet presentation',
          'Get Minister sign-off on revised timeline'
        ]
      }
    }
  ];

  const upcomingMeetings = [
    {
      title: 'Finance Secretary Coordination',
      date: 'Tomorrow, 10:00 AM',
      duration: '1 hour',
      stakes: 'Critical - Budget approval',
      prepStatus: 'in-progress',
      keyObjective: 'Get Finance to agree to joint oversight mechanism',
      anticipatedPushback: [
        'Finance will want full veto power',
        'They\'ll cite Tamil Nadu vendor delays',
        'Likely to question IT Dept\'s capability'
      ]
    },
    {
      title: 'Minister Check-in',
      date: 'Friday, 3:00 PM',
      duration: '30 min',
      stakes: 'Medium - Progress update',
      prepStatus: 'not-started'
    }
  ];

  const weeklyActions = [
    {
      day: 'Monday',
      status: 'complete',
      actions: [
        {
          title: 'Review Finance concerns from last meeting',
          framework: 'Stakeholder Mapping',
          outcome: 'Identified: Real concern is authority, not technical oversight'
        }
      ]
    },
    {
      day: 'Tuesday',
      status: 'complete',
      actions: [
        {
          title: 'Draft joint oversight proposal',
          framework: 'Coalition Building',
          outcome: 'Created structure that gives Finance approval role'
        }
      ]
    },
    {
      day: 'Wednesday',
      status: 'active',
      actions: [
        {
          title: 'Finance Secretary meeting (10am)',
          framework: 'Power Dynamic Analysis',
          status: 'pending',
          prepChecklist: [
            { item: 'Review opening script', done: true },
            { item: 'Anticipate pushback points', done: true },
            { item: 'Prepare ecosystem context', done: false },
            { item: 'Have joint oversight doc ready', done: true }
          ]
        }
      ]
    }
  ];

  const activeProject = projects[0];

  return (
    <AppShell>
      <div className="p-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                <FolderKanban className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold">Project Application</h1>
                <p className="text-sm text-muted-foreground">Live coaching on real work</p>
              </div>
            </div>
            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500">
              <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></div>
              Google Drive connected
            </Badge>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 w-fit mb-8">
          <Button
            variant={activeTab === 'plan' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('plan')}
          >
            Plan Ahead
          </Button>
          <Button
            variant={activeTab === 'apply' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('apply')}
          >
            Apply This Week
          </Button>
          <Button
            variant={activeTab === 'reflect' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('reflect')}
          >
            Reflect & Learn
          </Button>
        </div>

        {/* Plan Ahead View */}
        {activeTab === 'plan' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Upcoming Meetings */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-lg font-semibold">Upcoming Meetings</h2>

              {upcomingMeetings.map((meeting, idx) => (
                <Card key={idx} className={meeting.prepStatus === 'in-progress' ? 'border-purple-500/30' : ''}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{meeting.title}</CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <Clock className="h-3 w-3" />
                          {meeting.date} • {meeting.duration}
                        </CardDescription>
                      </div>
                      <Badge
                        variant="outline"
                        className={meeting.stakes.includes('Critical') ? 'border-red-500/30 text-red-400' : ''}
                      >
                        {meeting.stakes}
                      </Badge>
                    </div>
                  </CardHeader>

                  {meeting.keyObjective && (
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Your Objective</p>
                        <p className="text-sm font-medium">{meeting.keyObjective}</p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Anticipate These Responses</p>
                        <div className="space-y-2">
                          {meeting.anticipatedPushback?.map((pushback, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                              {pushback}
                            </div>
                          ))}
                        </div>
                      </div>

                      <Button className="w-full">
                        Prepare for Meeting
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>

            {/* Stakeholder Status */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Key Stakeholders</h2>

              <Card>
                <CardContent className="pt-6 space-y-4">
                  {activeProject.stakeholders.map((sh, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{sh.name}</span>
                        <Badge
                          variant="outline"
                          className={
                            sh.trend === 'declining' ? 'text-red-400 border-red-500/30' :
                            sh.trend === 'impatient' ? 'text-amber-400 border-amber-500/30' :
                            'text-emerald-400 border-emerald-500/30'
                          }
                        >
                          {sh.trend}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-muted-foreground">Power</span>
                            <span>{sh.power}%</span>
                          </div>
                          <Progress value={sh.power} className="h-1" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-muted-foreground">Support</span>
                            <span>{sh.support}%</span>
                          </div>
                          <Progress
                            value={sh.support}
                            className={`h-1 ${sh.support > 60 ? '' : sh.support > 40 ? '' : ''}`}
                          />
                        </div>
                      </div>
                      {idx < activeProject.stakeholders.length - 1 && <Separator className="mt-3" />}
                    </div>
                  ))}

                  <Button variant="outline" className="w-full mt-4">
                    View Full Map
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardContent>
              </Card>

              {/* Weekly Plan */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">This Week's Plan</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Key Outcomes</p>
                    {activeProject.weeklyPlan.keyOutcomes.map((outcome, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm mb-2">
                        <Target className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
                        {outcome}
                      </div>
                    ))}
                  </div>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Frameworks to Apply</p>
                    <div className="flex flex-wrap gap-2">
                      {activeProject.weeklyPlan.plannedFrameworks.map((fw, idx) => (
                        <Badge key={idx} variant="secondary">{fw}</Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Apply This Week View */}
        {activeTab === 'apply' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold">This Week's Application</h2>
                <p className="text-sm text-muted-foreground">Track framework applications in real meetings</p>
              </div>
              <span className="text-sm text-muted-foreground">Week of Jan 6 - 12, 2026</span>
            </div>

            <div className="space-y-4">
              {weeklyActions.map((day, dayIdx) => (
                <Card key={dayIdx} className={day.status === 'active' ? 'border-purple-500/30' : ''}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                          day.status === 'complete' ? 'bg-emerald-500 text-white' :
                          day.status === 'active' ? 'bg-purple-500 text-white' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {day.status === 'complete' ? <CheckCircle2 className="h-4 w-4" /> : dayIdx + 1}
                        </div>
                        <CardTitle className="text-base">{day.day}</CardTitle>
                      </div>
                      {day.status === 'active' && (
                        <Badge className="bg-purple-500/20 text-purple-400">Today</Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {day.actions.map((action, actionIdx) => (
                      <div key={actionIdx} className="bg-secondary/50 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium">{action.title}</p>
                            <p className="text-xs text-muted-foreground">
                              Framework: <span className="text-purple-400">{action.framework}</span>
                            </p>
                          </div>
                          {'status' in action && action.status === 'pending' && (
                            <Badge variant="outline" className="text-purple-400 border-purple-500/30">
                              In 2 hours
                            </Badge>
                          )}
                        </div>

                        {'prepChecklist' in action && action.prepChecklist && (
                          <div className="mt-4 pt-4 border-t border-border">
                            <p className="text-xs text-muted-foreground mb-2">Pre-Meeting Checklist</p>
                            <div className="space-y-2">
                              {action.prepChecklist.map((item: { item: string; done: boolean }, i: number) => (
                                <div key={i} className="flex items-center gap-2 text-sm">
                                  <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                                    item.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-muted'
                                  }`}>
                                    {item.done && <CheckCircle2 className="h-3 w-3" />}
                                  </div>
                                  <span className={item.done ? 'text-muted-foreground line-through' : ''}>
                                    {item.item}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {'outcome' in action && action.outcome && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <p className="text-xs text-emerald-400 mb-1">Outcome</p>
                            <p className="text-sm text-muted-foreground">{action.outcome}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Reflect & Learn View */}
        {activeTab === 'reflect' && (
          <div className="max-w-3xl mx-auto">
            <div className="mb-8">
              <h2 className="text-lg font-semibold">Weekly Reflection</h2>
              <p className="text-sm text-muted-foreground">Last reflection: 5 days ago</p>
            </div>

            <div className="space-y-6">
              {/* Cognitive Gains */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Cognitive Development This Week</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-secondary/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium">Action Bias</span>
                      <span className="text-emerald-400 font-semibold">-4 pts</span>
                    </div>
                    <div className="flex items-center gap-4 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>Before</span>
                          <span>72%</span>
                        </div>
                        <Progress value={72} className="h-2" />
                      </div>
                      <span className="text-lg">→</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>After</span>
                          <span>68%</span>
                        </div>
                        <Progress value={68} className="h-2" />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-3">
                      Evidence: Took 3-second pause before responding in Monday prep meeting
                    </p>
                  </div>

                  <div className="bg-secondary/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium">Stakeholder Awareness</span>
                      <span className="text-purple-400 font-semibold">+6 pts</span>
                    </div>
                    <div className="flex items-center gap-4 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>Before</span>
                          <span>58%</span>
                        </div>
                        <Progress value={58} className="h-2" />
                      </div>
                      <span className="text-lg">→</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>After</span>
                          <span>64%</span>
                        </div>
                        <Progress value={64} className="h-2" />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-3">
                      Evidence: Correctly predicted Finance's real concerns before meeting
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Breakthrough Moment */}
              <Card className="border-purple-500/30 bg-gradient-to-r from-purple-500/10 to-transparent">
                <CardHeader>
                  <CardTitle className="text-base">Breakthrough Moment</CardTitle>
                </CardHeader>
                <CardContent>
                  <h4 className="font-semibold mb-2">Caught yourself mid-response</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    In prep meeting, started explaining technical details, then paused and asked about Finance's authority concerns instead.
                  </p>
                  <div className="bg-secondary rounded-lg p-4">
                    <p className="text-xs text-purple-400 mb-1">Why This Matters</p>
                    <p className="text-sm">First time applying framework without prompting</p>
                  </div>
                </CardContent>
              </Card>

              {/* Next Week Focus */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Next Week's Focus</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Continue stakeholder awareness work, begin Power Dynamic Analysis practice
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
