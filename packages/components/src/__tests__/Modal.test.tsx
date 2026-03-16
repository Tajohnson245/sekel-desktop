import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '../ui/Modal';

function renderModal(props: Partial<Parameters<typeof Modal>[0]> = {}) {
    const defaults = {
        isOpen: true,
        onClose: vi.fn(),
        title: 'Test Modal',
        children: <p>Modal content</p>,
    };
    return render(<Modal {...defaults} {...props} />);
}

describe('Modal', () => {
    it('renders title and children when open', () => {
        renderModal();
        expect(screen.getByText('Test Modal')).toBeInTheDocument();
        expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('renders nothing when isOpen is false', () => {
        renderModal({ isOpen: false });
        expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
    });

    it('calls onClose when overlay is clicked', async () => {
        const onClose = vi.fn();
        renderModal({ onClose });
        await userEvent.click(document.querySelector('.modal-overlay')!);
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('does not call onClose when modal content is clicked', async () => {
        const onClose = vi.fn();
        renderModal({ onClose });
        await userEvent.click(document.querySelector('.modal')!);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('calls onClose when Escape key is pressed', async () => {
        const onClose = vi.fn();
        renderModal({ onClose });
        await userEvent.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('renders footer when provided', () => {
        renderModal({ footer: <button>Confirm</button> });
        expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    });

    it('does not render footer section when not provided', () => {
        renderModal();
        expect(document.querySelector('.modal-actions')).not.toBeInTheDocument();
    });

    it('has dialog role and aria-modal', () => {
        renderModal();
        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveAttribute('aria-modal', 'true');
    });
});
