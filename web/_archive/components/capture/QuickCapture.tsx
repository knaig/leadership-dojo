'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Mail,
  Calendar,
  MessageSquare,
  Lightbulb,
  Mic,
  MicOff,
  Send,
  Loader2,
  CheckCircle2,
  Sparkles
} from 'lucide-react';

type EventType = 'meeting' | 'email' | 'conversation' | 'decision';

interface CaptureData {
  eventType: EventType;
  whatHappened: string;
  outcome: number; // -2 to 2 (much worse to much better than expected)
  keyMoments: string;
}

export function QuickCapture() {
  const [captureData, setCaptureData] = useState<CaptureData>({
    eventType: 'meeting',
    whatHappened: '',
    outcome: 0,
    keyMoments: ''
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const eventTypes: { value: EventType; label: string; icon: React.ReactNode }[] = [
    { value: 'meeting', label: 'Meeting', icon: <Calendar className="h-4 w-4" /> },
    { value: 'email', label: 'Email/Message', icon: <Mail className="h-4 w-4" /> },
    { value: 'conversation', label: 'Conversation', icon: <MessageSquare className="h-4 w-4" /> },
    { value: 'decision', label: 'Decision Made', icon: <Lightbulb className="h-4 w-4" /> }
  ];

  const outcomeLabels: Record<number, string> = {
    [-2]: 'Much worse than expected',
    [-1]: 'Slightly worse',
    [0]: 'As expected',
    [1]: 'Slightly better',
    [2]: 'Much better than expected'
  };

  const toggleRecording = () => {
    if (isRecording) {
      // Stop recording
      setIsRecording(false);
      // In real implementation, this would stop the speech recognition
      // and append the transcribed text to whatHappened
    } else {
      // Start recording
      setIsRecording(true);
      // In real implementation, this would start speech recognition
      // For now, we'll simulate it
      setTimeout(() => {
        setCaptureData(prev => ({
          ...prev,
          whatHappened: prev.whatHappened + (prev.whatHappened ? '\n\n' : '') +
            '[Voice input would appear here after transcription]'
        }));
        setIsRecording(false);
      }, 3000);
    }
  };

  const handleSubmit = async (analyze: boolean = false) => {
    if (!captureData.whatHappened.trim()) return;

    setIsSubmitting(true);
    if (analyze) setIsAnalyzing(true);

    try {
      const response = await fetch('/api/workspace/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...captureData,
          analyzImmediately: analyze
        })
      });

      if (response.ok) {
        setSubmitSuccess(true);
        // Reset form after short delay
        setTimeout(() => {
          setCaptureData({
            eventType: 'meeting',
            whatHappened: '',
            outcome: 0,
            keyMoments: ''
          });
          setSubmitSuccess(false);
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to submit capture:', error);
    } finally {
      setIsSubmitting(false);
      setIsAnalyzing(false);
    }
  };

  if (submitSuccess) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <CheckCircle2 className="h-16 w-16 mx-auto text-emerald-500 mb-4" />
            <h3 className="text-xl font-medium mb-2">Captured!</h3>
            <p className="text-muted-foreground">
              {isAnalyzing
                ? 'Analyzing your capture for insights...'
                : 'Your capture has been saved. You can review it in the Reflect tab.'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Capture Card */}
      <Card>
        <CardHeader>
          <CardTitle>What just happened?</CardTitle>
          <CardDescription>
            Capture a work event while it's fresh. The system will analyze it for insights.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Event Type */}
          <div className="space-y-3">
            <Label>Event Type</Label>
            <div className="flex flex-wrap gap-2">
              {eventTypes.map((type) => (
                <Button
                  key={type.value}
                  variant={captureData.eventType === type.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCaptureData(prev => ({ ...prev, eventType: type.value }))}
                  className="gap-2"
                >
                  {type.icon}
                  {type.label}
                </Button>
              ))}
            </div>
          </div>

          {/* What Happened */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="whatHappened">What happened?</Label>
              <Button
                variant={isRecording ? 'destructive' : 'outline'}
                size="sm"
                onClick={toggleRecording}
                className="gap-2"
              >
                {isRecording ? (
                  <>
                    <MicOff className="h-4 w-4" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" />
                    Voice Input
                  </>
                )}
              </Button>
            </div>
            <Textarea
              id="whatHappened"
              placeholder="Describe what happened, key decisions made, notable moments..."
              value={captureData.whatHappened}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCaptureData(prev => ({ ...prev, whatHappened: e.target.value }))}
              className="min-h-[150px]"
            />
            {isRecording && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                Recording... speak now
              </div>
            )}
          </div>

          {/* Outcome Slider */}
          <div className="space-y-3">
            <Label>How did it go?</Label>
            <div className="space-y-4">
              <Slider
                value={[captureData.outcome]}
                onValueChange={(value: number[]) => setCaptureData(prev => ({ ...prev, outcome: value[0] }))}
                min={-2}
                max={2}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>😟 Worse</span>
                <span className="font-medium text-foreground">
                  {outcomeLabels[captureData.outcome]}
                </span>
                <span>Better 😊</span>
              </div>
            </div>
          </div>

          {/* Key Moments (Optional) */}
          <div className="space-y-3">
            <Label htmlFor="keyMoments">
              Key moments <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="keyMoments"
              placeholder="Any specific moments that stood out? Things that went well or could have gone better?"
              value={captureData.keyMoments}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCaptureData(prev => ({ ...prev, keyMoments: e.target.value }))}
              className="min-h-[80px]"
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={() => handleSubmit(false)}
              disabled={!captureData.whatHappened.trim() || isSubmitting}
              variant="outline"
              className="flex-1"
            >
              {isSubmitting && !isAnalyzing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Save
            </Button>
            <Button
              onClick={() => handleSubmit(true)}
              disabled={!captureData.whatHappened.trim() || isSubmitting}
              className="flex-1"
            >
              {isAnalyzing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Save & Analyze
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Captures */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Captures</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">Team standup</p>
                  <p className="text-xs text-muted-foreground">2 hours ago</p>
                </div>
              </div>
              <Badge variant="outline" className="text-emerald-500">Analyzed</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">Response to stakeholder feedback</p>
                  <p className="text-xs text-muted-foreground">Yesterday</p>
                </div>
              </div>
              <Badge variant="outline" className="text-emerald-500">Analyzed</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <Lightbulb className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">Project scope decision</p>
                  <p className="text-xs text-muted-foreground">2 days ago</p>
                </div>
              </div>
              <Badge variant="outline">Pending</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
