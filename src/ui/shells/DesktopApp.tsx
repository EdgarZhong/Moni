import { Header } from '@ui/components/Header';
import { ActivityMatrix } from '@ui/components/ActivityMatrix';
import { TransactionList } from '@ui/components/TransactionList';
import { DateRangePicker } from '@ui/components/desktop/DateRangePicker';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppLogic } from '@ui/hooks/useAppLogic';

export function DesktopApp() {
  const {
    transactions,
    filteredTransactions,
    isLoading,
    filter,
    handleTabChange,
    direction,
    dateRange,
    setDateRange,
    fileInputRef,
    handleFileChange,
    handleLoadData,
    totalExpense,
    totalIncome,
    TABS
  } = useAppLogic();

  // In headless mode, we don't change the UI logic. 
  // The standard button remains "LOAD_DATA_SOURCE"
  // If debug scaffold auto-connects, it happens silently.
  // If it needs permission (warned in console), user will click "LOAD_DATA_SOURCE"
  // which triggers standard flow (requestDirectoryHandle). 
  // Standard flow will then update the DB record, fixing the permission issue for next reload.
  
  const onHeaderClick = () => {
    // Standard flow always
    handleLoadData();
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 20 : -20,
      opacity: 0,
      filter: 'blur(4px)'
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
      filter: 'blur(0px)'
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 20 : -20,
      opacity: 0,
      filter: 'blur(4px)'
    })
  };

  return (
    <>
      {/* Fixed Background Layer */}
      <div className="fixed inset-0 z-[-1] bg-background bg-dot-matrix pointer-events-none" />
      
      <div className="min-h-screen text-primary p-4 md:p-8 font-mono">
        <div className="max-w-5xl mx-auto">
          {/* Hidden Input for Directory Selection */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            // @ts-expect-error - webkitdirectory is non-standard but supported
            webkitdirectory="" 
            directory=""
            multiple
          />

          <Header 
            aiStatus={isLoading ? 'ANALYZING' : 'IDLE'} 
            onAIAction={(action) => {
              if (action === 'START') {
                onHeaderClick();
              }
            }}
          />

          <main className="animate-fade-in">
            {/* Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12 border-b border-gray-800 pb-8">
              <div>
                <div className="text-dim text-xs mb-1">TOTAL_EXPENSE</div>
                <div className="text-2xl md:text-3xl font-bold text-expense-red">
                  -¥{totalExpense.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-dim text-xs mb-1">TOTAL_INCOME</div>
                <div className="text-2xl md:text-3xl font-bold text-income-yellow">
                  +¥{totalIncome.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-dim text-xs mb-1">TXN_COUNT</div>
                <div className="text-2xl md:text-3xl font-bold">
                  {filteredTransactions.length}
                </div>
              </div>
              <div className="md:-ml-12">
                <div className="text-dim text-xs mb-1 font-mono tracking-wider">DATA_RANGE</div>
                {transactions.length > 0 ? (
                  <DateRangePicker
                    minDate={transactions[transactions.length - 1]?.originalDate || new Date()}
                    maxDate={transactions[0]?.originalDate || new Date()}
                    startDate={dateRange.start || transactions[transactions.length - 1]?.originalDate || new Date()}
                    endDate={dateRange.end || transactions[0]?.originalDate || new Date()}
                    onChange={(start, end) => setDateRange({ start, end })}
                  />
                ) : (
                  <div className="h-10 w-64 flex items-center text-dim opacity-50 text-sm font-mono">
                    NO DATA
                  </div>
                )}
              </div>
            </div>

            {/* Activity Matrix */}
            <ActivityMatrix transactions={filteredTransactions} />

            {/* Filter Tabs */}
            <div className="flex gap-4 mb-6 border-b border-gray-800">
              {TABS.map((f) => (
                <button
                  key={f}
                  onClick={() => handleTabChange(f)}
                  className={`pb-2 px-1 text-xs transition-colors relative font-pixel tracking-tight ${
                    filter === f ? 'text-white' : 'text-dim hover:text-gray-400'
                  }`}
                >
                  {f}_VIEW
                  {filter === f && (
                    <motion.div 
                      layoutId="tab-indicator"
                      className="absolute bottom-0 left-0 w-full h-[2px] bg-pixel-green" 
                    />
                  )}
                </button>
              ))}
            </div>

            {/* TransactionList */}
            <AnimatePresence mode="popLayout" custom={direction} initial={false}>
              <motion.div
                key={filter}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: "easeInOut" }}
              >
                <TransactionList 
                  transactions={filteredTransactions} 
                  currentFilter={filter}
                />
              </motion.div>
            </AnimatePresence>

            {/* Footer */}
            <footer className="mt-16 mb-8 text-center text-dim text-[10px] font-mono opacity-40">
              <p>DESIGNED & ENGINEERED BY <span className="font-bold text-gray-400">CYBERZEN STUDIO</span></p>
            </footer>
          </main>
        </div>
      </div>
    </>
  );
}
