"use client";

import React, { useState } from "react";
import "./ResponseTable.css";
import type { RespondentRow } from "../types";

const PAGE_SIZE = 20;

interface ResponseTableProps {
  respondents: RespondentRow[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const WISHLIST_KEYS = ["biggest_frustration","magic_wand","ideal_session","would_pay_for"];
const WISHLIST_LABELS: Record<string, string> = {
  biggest_frustration: "Biggest frustration",
  magic_wand: "Magic wand",
  ideal_session: "Ideal session",
  would_pay_for: "Would pay for",
};

export default function ResponseTable({ respondents }: ResponseTableProps) {
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const total = respondents.length;
  const pageData = respondents.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="response-table">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              <th>School</th>
              <th>Year</th>
              <th>Exam</th>
              <th>Tools</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((r) => (
              <React.Fragment key={r.id}>
                <tr>
                  <td>{formatDate(r.created_at)}</td>
                  <td>
                    {r.name ? (
                      r.name
                    ) : (
                      <span className="response-table__anon">Anonymous</span>
                    )}
                  </td>
                  <td>{r.school}</td>
                  <td>{r.year}</td>
                  <td>{r.exam_upcoming ?? <span className="response-table__anon">—</span>}</td>
                  <td>
                    <div className="response-table__tool-chips">
                      {r.study_tools.slice(0, 3).map((t) => (
                        <span key={t.tool_name} className="response-table__tool-chip">{t.tool_name}</span>
                      ))}
                      {r.study_tools.length > 3 && (
                        <span className="response-table__tool-chip">+{r.study_tools.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <button
                      className="response-table__expand-btn"
                      onClick={() => toggleExpand(r.id)}
                    >
                      {expanded.has(r.id) ? "Hide" : "Details"}
                    </button>
                  </td>
                </tr>
                {expanded.has(r.id) && (
                  <tr className="response-table__detail-row">
                    <td colSpan={7}>
                      <div className="response-table__detail-grid">
                        <div className="response-table__detail-section">
                          <h5>Wishlist Answers</h5>
                          {WISHLIST_KEYS.map((key) => {
                            const resp = r.survey_responses.find((s) => s.question_key === key);
                            return resp ? (
                              <div key={key} style={{ marginBottom: "0.75rem" }}>
                                <strong style={{ display: "block", fontSize: "0.8125rem", color: "var(--slate)", marginBottom: "0.25rem" }}>
                                  {WISHLIST_LABELS[key]}
                                </strong>
                                <p>{resp.answer}</p>
                              </div>
                            ) : null;
                          })}
                          {!r.survey_responses.length && <p style={{ color: "var(--mist)", fontStyle: "italic" }}>No answers</p>}
                        </div>
                        <div className="response-table__detail-section">
                          <h5>Tools Detail</h5>
                          {r.study_tools.map((t) => (
                            <div key={t.tool_name} style={{ marginBottom: "0.375rem" }}>
                              <span className="response-table__tool-chip">{t.tool_name}</span>
                            </div>
                          ))}
                          {r.email && (
                            <div style={{ marginTop: "0.75rem" }}>
                              <h5>Email</h5>
                              <p>{r.email}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="response-table__pagination">
          <span className="response-table__page-info">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="response-table__page-btns">
            <button
              className="response-table__page-btn"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              className="response-table__page-btn"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
