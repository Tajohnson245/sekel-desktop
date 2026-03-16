"use client";

import { useState } from "react";
import "./StepTools.css";
import Textarea from "../ui/Textarea";
import Input from "../ui/Input";
import type { StudyToolData } from "../types";

const TOOL_OPTIONS = [
  "Anki","UWorld","AMBOSS","Sketchy","Pathoma",
  "Boards & Beyond","First Aid","Osmosis","Picmonic","Firecracker","Other",
];

const FREQUENCY_OPTIONS = ["Daily","Few times a week","Weekly","Rarely"];

interface StepToolsProps {
  tools: StudyToolData[];
  onChange: (tools: StudyToolData[]) => void;
}

export default function StepTools({ tools, onChange }: StepToolsProps) {
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());

  const selectedNames = new Set(tools.map((t) => t.tool_name));

  function toggleTool(name: string) {
    if (selectedNames.has(name)) {
      onChange(tools.filter((t) => t.tool_name !== name));
      setOpenCards((prev) => { const next = new Set(prev); next.delete(name); return next; });
    } else {
      onChange([...tools, { tool_name: name }]);
      setOpenCards((prev) => new Set([...prev, name]));
    }
  }

  function updateTool(name: string, patch: Partial<StudyToolData>) {
    onChange(tools.map((t) => t.tool_name === name ? { ...t, ...patch } : t));
  }

  function toggleCard(name: string) {
    setOpenCards((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  return (
    <div>
      <div className="step-tools__grid">
        {TOOL_OPTIONS.map((name) => (
          <label
            key={name}
            className={`step-tools__tool-check${selectedNames.has(name) ? " step-tools__tool-check--selected" : ""}`}
          >
            <input
              type="checkbox"
              checked={selectedNames.has(name)}
              onChange={() => toggleTool(name)}
            />
            <span>{name}</span>
          </label>
        ))}
      </div>

      {tools.length > 0 && (
        <div className="step-tools__detail-list">
          {tools.map((tool) => {
            const isOpen = openCards.has(tool.tool_name);
            return (
              <div key={tool.tool_name} className="step-tools__detail-card">
                <div
                  className={`step-tools__detail-header${isOpen ? " step-tools__detail-header--open" : ""}`}
                  onClick={() => toggleCard(tool.tool_name)}
                >
                  <h4>{tool.tool_name}</h4>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                {isOpen && (
                  <div className="step-tools__detail-body">
                    {tool.tool_name === "Other" && (
                      <div className="step-tools__other-input">
                        <Input
                          label="Which tool?"
                          placeholder="Tool name"
                          value={tool.tool_name_other ?? ""}
                          onChange={(e) => updateTool(tool.tool_name, { tool_name_other: e.target.value })}
                        />
                      </div>
                    )}

                    <div>
                      <p className="step-tools__section-label">How often do you use this?</p>
                      <div className="step-tools__freq-pills">
                        {FREQUENCY_OPTIONS.map((freq) => (
                          <button
                            key={freq}
                            type="button"
                            className={`step-tools__freq-pill${tool.usage_frequency === freq ? " step-tools__freq-pill--selected" : ""}`}
                            onClick={() => updateTool(tool.tool_name, { usage_frequency: freq })}
                          >
                            {freq}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="step-tools__section-label">Satisfaction (1–5)</p>
                      <div className="step-tools__stars">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            className="step-tools__star"
                            aria-label={`${n} star`}
                            onClick={() => updateTool(tool.tool_name, { satisfaction: n })}
                          >
                            {(tool.satisfaction ?? 0) >= n ? "★" : "☆"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Textarea
                      label="What do you like about it?"
                      rows={2}
                      placeholder="Optional"
                      value={tool.pros ?? ""}
                      onChange={(e) => updateTool(tool.tool_name, { pros: e.target.value })}
                    />
                    <Textarea
                      label="What frustrates you about it?"
                      rows={2}
                      placeholder="Optional"
                      value={tool.cons ?? ""}
                      onChange={(e) => updateTool(tool.tool_name, { cons: e.target.value })}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
