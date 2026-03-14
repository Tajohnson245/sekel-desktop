import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '../ui/Input';

describe('Input', () => {
    it('renders an input element by default', () => {
        render(<Input />);
        expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('renders a textarea when multiline is true', () => {
        render(<Input multiline />);
        expect(screen.getByRole('textbox').tagName).toBe('TEXTAREA');
    });

    it('renders label when provided', () => {
        render(<Input label="Email" />);
        expect(screen.getByText('Email')).toBeInTheDocument();
    });

    it('renders error message when error prop is set', () => {
        render(<Input error="Required field" />);
        expect(screen.getByText('Required field')).toBeInTheDocument();
    });

    it('applies input-error class when error is present', () => {
        render(<Input error="oops" />);
        expect(screen.getByRole('textbox').className).toContain('input-error');
    });

    it('does not apply input-error class without error', () => {
        render(<Input />);
        expect(screen.getByRole('textbox').className).not.toContain('input-error');
    });

    it('calls onChange when value changes', async () => {
        const onChange = vi.fn();
        render(<Input onChange={onChange} />);
        await userEvent.type(screen.getByRole('textbox'), 'hello');
        expect(onChange).toHaveBeenCalled();
    });

    it('renders placeholder text', () => {
        render(<Input placeholder="Enter text" />);
        expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
    });
});
