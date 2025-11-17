
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/icons/logo';
import { KeyRound, Lock } from 'lucide-react';

interface AuthScreenProps {
  isSetup: boolean;
  onPasswordSet: (password: string) => void;
  onLogin: (password: string) => boolean;
}

export function AuthScreen({ isSetup, onPasswordSet, onLogin }: AuthScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSetup = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    onPasswordSet(password);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const success = onLogin(password);
    if (!success) {
      setError('Incorrect password. Please try again.');
    } else {
      setError('');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center items-center gap-2 mb-2">
            <Logo className="h-8 w-8 text-accent" />
            <CardTitle className="text-2xl font-headline">Liquidator Bot</CardTitle>
          </div>
          <CardDescription>
            {isSetup ? 'Create an admin password to secure your bot.' : 'Enter your password to unlock the dashboard.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={isSetup ? handleSetup : handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            {isSetup && (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10"
                        required
                    />
                </div>
              </div>
            )}
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button type="submit" className="w-full">
              <Lock className="mr-2 h-4 w-4" />
              {isSetup ? 'Set Password & Unlock' : 'Unlock'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

    