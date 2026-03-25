import './ToggleSwitch.css';

interface ToggleSwitchProps {
    checked: boolean;
    onChange: (next: boolean) => void;
    disabled?: boolean;
}

export function ToggleSwitch({ checked, onChange, disabled = false }: ToggleSwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            className="toggle-switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
        >
            <span className="toggle-switch-knob" />
        </button>
    );
}
