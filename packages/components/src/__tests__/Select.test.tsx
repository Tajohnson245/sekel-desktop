import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from '../ui/Select';

const OPTIONS = [
    { label: 'Option A', value: 'a' },
    { label: 'Option B', value: 'b' },
    { label: 'Option C', value: 'c' },
];

describe('Select', () => {
    it('renders all options', () => {
        render(<Select options={OPTIONS} />);
        expect(screen.getByRole('option', { name: 'Option A' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Option B' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Option C' })).toBeInTheDocument();
    });

    it('renders a placeholder option when provided', () => {
        render(<Select options={OPTIONS} placeholder="Choose one" />);
        expect(screen.getByRole('option', { name: 'Choose one' })).toBeInTheDocument();
    });

    it('placeholder option has empty value', () => {
        render(<Select options={OPTIONS} placeholder="Choose one" />);
        const placeholder = screen.getByRole('option', { name: 'Choose one' }) as HTMLOptionElement;
        expect(placeholder.value).toBe('');
    });

    it('renders label when provided', () => {
        render(<Select options={OPTIONS} label="Language" />);
        expect(screen.getByText('Language')).toBeInTheDocument();
    });

    it('renders error message when provided', () => {
        render(<Select options={OPTIONS} error="Select a value" />);
        expect(screen.getByText('Select a value')).toBeInTheDocument();
    });

    it('calls onChange when selection changes', async () => {
        const onChange = vi.fn();
        render(<Select options={OPTIONS} onChange={onChange} />);
        await userEvent.selectOptions(screen.getByRole('combobox'), 'b');
        expect(onChange).toHaveBeenCalled();
    });

    it('reflects the selected value', async () => {
        render(<Select options={OPTIONS} />);
        await userEvent.selectOptions(screen.getByRole('combobox'), 'c');
        expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('c');
    });
});
