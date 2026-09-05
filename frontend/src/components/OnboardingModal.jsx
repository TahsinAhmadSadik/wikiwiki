import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import '../styles/onboarding.css';

export default function OnboardingModal({ onComplete }) {
  const [step, setStep] = useState(1); // 1 = Categories, 2 = Wikis
  const [categories, setCategories] = useState([]);
  const [wikis, setWikis] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedWikis, setSelectedWikis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const data = await api.get('/auth/onboarding-data');
        setCategories(data.categories || []);
        setWikis(data.wikis || []);
      } catch (err) {
        console.error('Failed to load onboarding options:', err);
      } finally {
        setLoading(false);
      }
    };
    loadOptions();
  }, []);

  const toggleCategory = (id) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const toggleWiki = (id) => {
    setSelectedWikis((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api.post('/auth/onboarding', {
        category_ids: selectedCategories,
        wiki_ids: selectedWikis,
      });
      onComplete();
    } catch (err) {
      console.error('Failed to save onboarding setup:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="step-indicator">Step {step} of 2</div>

        {step === 1 && (
          <>
            <header className="modal-header">
              <h2>Select your interests</h2>
              <p>Pick categories you would like to follow in your feed</p>
            </header>

            {loading ? (
              <div style={{ padding: '2rem 0', color: '#71717a' }}>Loading categories...</div>
            ) : (
              <div className="pill-grid">
                {categories.map((cat) => {
                  const isSelected = selectedCategories.includes(cat.category_id);
                  return (
                    <button
                      key={cat.category_id}
                      type="button"
                      className={`interest-pill ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleCategory(cat.category_id)}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            )}

            <footer className="modal-actions">
              <button type="button" className="skip-btn" onClick={() => setStep(2)}>
                Skip step
              </button>
              <button
                type="button"
                className="onboarding-btn primary"
                onClick={() => setStep(2)}
              >
                Continue
              </button>
            </footer>
          </>
        )}

        {step === 2 && (
          <>
            <header className="modal-header">
              <h2>Follow top wikis</h2>
              <p>Select spaces to populate your personal timeline</p>
            </header>

            {loading ? (
              <div style={{ padding: '2rem 0', color: '#71717a' }}>Loading wikis...</div>
            ) : (
              <div className="pill-grid">
                {wikis.length === 0 ? (
                  <div style={{ color: '#71717a', fontSize: '0.85rem' }}>No wikis available yet.</div>
                ) : (
                  wikis.map((wiki) => {
                    const isSelected = selectedWikis.includes(wiki.wiki_id);
                    return (
                      <button
                        key={wiki.wiki_id}
                        type="button"
                        className={`interest-pill ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleWiki(wiki.wiki_id)}
                      >
                        {wiki.title}
                      </button>
                    );
                  })
                )}
              </div>
            )}

            <footer className="modal-actions">
              <button
                type="button"
                className="onboarding-btn secondary"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <div className="action-group">
                <button
                  type="button"
                  className="skip-btn"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  Skip all
                </button>
                <button
                  type="button"
                  className="onboarding-btn primary"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? 'Saving...' : 'Finish setup'}
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}