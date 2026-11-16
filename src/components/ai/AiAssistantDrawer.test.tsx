import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AiAssistantDrawer } from './AiAssistantDrawer';
import { useAiStore, DEFAULT_AI_SETTINGS } from '../../stores/aiStore';

describe('AiAssistantDrawer', () => {
  beforeEach(() => {
    useAiStore.setState({
      settings: { ...DEFAULT_AI_SETTINGS, enabled: true },
      isOpen: true,
      isLoading: false,
      error: null,
      messages: [],
    });
    vi.restoreAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    useAiStore.setState({ isOpen: false });
    const { container } = render(<AiAssistantDrawer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders drawer header and local-first indicator when open', () => {
    render(<AiAssistantDrawer />);
    expect(screen.getByText('Local AI Assistant')).toBeInTheDocument();
    expect(screen.getByText('Local-First')).toBeInTheDocument();
    expect(screen.getByText('Zero cloud leakage')).toBeInTheDocument();
  });

  it('shows disabled banner when settings.enabled is false', () => {
    useAiStore.setState({ settings: { ...DEFAULT_AI_SETTINGS, enabled: false } });
    render(<AiAssistantDrawer />);
    expect(screen.getByText('Local AI Assistant is currently disabled')).toBeInTheDocument();
  });

  it('renders messages and extracted sql snippet with insert/copy buttons', () => {
    const onInsertSql = vi.fn();
    useAiStore.setState({
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'Get all customers',
          timestamp: Date.now(),
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Here is the query:\n```sql\nSELECT * FROM customers;\n```',
          timestamp: Date.now(),
          sqlSnippet: 'SELECT * FROM customers;',
        },
      ],
    });

    render(<AiAssistantDrawer onInsertSql={onInsertSql} />);
    expect(screen.getByText('Get all customers')).toBeInTheDocument();
    expect(screen.getByText('SELECT * FROM customers;')).toBeInTheDocument();

    const insertBtn = screen.getByText('Insert');
    fireEvent.click(insertBtn);
    expect(onInsertSql).toHaveBeenCalledWith('SELECT * FROM customers;');
  });
});
