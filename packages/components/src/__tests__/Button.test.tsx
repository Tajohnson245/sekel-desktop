import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../ui/Button';

describe('Button', () => {
    it('renders children', () => {
        render(<Button>Save</Button>);
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });

    it('calls onClick when clicked', async () => {
        const onClick = vi.fn();
        render(<Button onClick={onClick}>Click me</Button>);
        await userEvent.click(screen.getByRole('button'));
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('is disabled when disabled prop is true', () => {
        render(<Button disabled>Submit</Button>);
        expect(screen.getByRole('button')).toBeDisabled();
    });

    it('is disabled when isLoading is true', () => {
        render(<Button isLoading>Submit</Button>);
        expect(screen.getByRole('button')).toBeDisabled();
    });

    it('does not call onClick when disabled', async () => {
        const onClick = vi.fn();
        render(<Button disabled onClick={onClick}>Submit</Button>);
        await userEvent.click(screen.getByRole('button'));
        expect(onClick).not.toHaveBeenCalled();
    });

    it('renders children when not loading', () => {
        render(<Button isLoading={false}>Save</Button>);
        expect(screen.getByText('Save')).toBeInTheDocument();
    });

    it('applies primary class by default', () => {
        render(<Button>Save</Button>);
        expect(screen.getByRole('button').className).toContain('btn-primary');
    });

    it('applies danger variant class', () => {
        render(<Button variant="danger">Delete</Button>);
        expect(screen.getByRole('button').className).toContain('btn-danger');
    });

    it('applies w-full class when fullWidth is true', () => {
        render(<Button fullWidth>Save</Button>);
        expect(screen.getByRole('button').className).toContain('w-full');
    });
});
