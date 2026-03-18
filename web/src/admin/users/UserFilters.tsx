import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface UserFiltersProps {
  email: string;
  role: string;
  onEmailChange: (email: string) => void;
  onRoleChange: (role: string) => void;
}

const DEBOUNCE_MS = 300;

export function UserFilters({ email, role, onEmailChange, onRoleChange }: UserFiltersProps) {
  const [localEmail, setLocalEmail] = useState(email);
  const timerRef = useRef<number | null>(null);
  const onEmailChangeRef = useRef(onEmailChange);
  onEmailChangeRef.current = onEmailChange;

  // Sync local state when URL param changes externally (e.g., browser back)
  useEffect(() => {
    setLocalEmail(email);
  }, [email]);

  // Debounced handler — only called from user input, not from URL sync
  const handleInputChange = useCallback((value: string) => {
    setLocalEmail(value);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      onEmailChangeRef.current(value);
      timerRef.current = null;
    }, DEBOUNCE_MS);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const hasFilters = email || role;

  return (
    <div className="flex items-center gap-3">
      <Input
        type="search"
        placeholder="Search by email..."
        value={localEmail}
        onChange={(e) => handleInputChange(e.target.value)}
        className="max-w-xs"
        aria-label="Search users by email"
      />
      <Select value={role || 'all'} onValueChange={(value) => onRoleChange(value === 'all' ? '' : value)}>
        <SelectTrigger className="w-36" aria-label="Filter by role">
          <SelectValue placeholder="All roles" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All roles</SelectItem>
          <SelectItem value="user">User</SelectItem>
          <SelectItem value="curator">Curator</SelectItem>
          <SelectItem value="admin">Admin</SelectItem>
        </SelectContent>
      </Select>
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Clear all filters"
          onClick={() => {
            if (timerRef.current !== null) {
              window.clearTimeout(timerRef.current);
              timerRef.current = null;
            }
            setLocalEmail('');
            onEmailChange('');
            onRoleChange('');
          }}
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
