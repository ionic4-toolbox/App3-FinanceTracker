
import {
  MonthOverView
} from './../../models/MonthOverview';

import {
  Category
} from './../../models/Category';
import {
  CategoryCost
} from './../../viewmodels/CategoryCost';
import * as moment from 'moment';

import {
  Injectable
} from '@angular/core';
import PouchDB from 'pouchdb';

import {
  Expense
} from '../../models/Expense';
import {
  Account
} from '../../models/Account';
import {
  Transaction
} from '../../models/Transaction';
import {
  UserOverview
} from '../../models/UserOverview';
import {
  MomentProvider
} from '../moment/moment';



/*
  Generated class for the DbProvider provider.

  See https://angular.io/guide/dependency-injection for more info on providers
  and Angular DI.
*/
@Injectable()
export class DbProvider {
  private db: PouchDB;
  private _id_now; // moment object
  private remote: any;
  private registeredUsername: string


  constructor(public momentProvider: MomentProvider) {
    /* used for doc _id fields*/
    this._id_now = this.momentProvider.getCurrentYearAndMonth();

    //PouchDB.plugin(pouchdbUpsert);
  }

  initSignIn(details, signUp ? : boolean): void {
    this.remote = details.userDBs.supertest;
    this.registeredUsername = details.user_id;
    this.db = new PouchDB('finance');
    this.db.sync(this.remote).on('complete', () => { // with the live options, complete never fires, so when its in sync, fire an event in the register page
      // initialized here, the datetime [min] and [max] does not work with promises
      this.initializeMinAndMaxDate();

      this.db.sync(this.remote, {
        live: true,
        retry: true, // waiting is overkill?
        continuous: true
      });
    })
    if (signUp) {
      this.db.put(new UserOverview(this.registeredUsername));
    }
  }

  initSignUp(details) {
    this.initSignIn(details, true);
  }

  /* needs to be setup before app starts, the ion datepicker doesnt handle promises */

  async initializeMinAndMaxDate() {
    this.momentProvider.setMaxDate(await this.getMaxDate());
    this.momentProvider.setMinDate(await this.getMinDate());
  }

  async getUserOverview() {
    let doc = await this.db.get(this.registeredUsername);
    return new UserOverview(doc._id, doc._rev, doc.externalAccounts);
  }

  getDb(): PouchDB {
    return this.db;
  }

  async saveMonthOverview(monthOverview: MonthOverView) {
    await this.db.put(monthOverview);
  }

  async saveUserOverview(userOverview: UserOverview) {
    await this.db.put(userOverview);
  }


  public async setupFirstMonthOverview(accounts: Account[]) {
    try {
      let firstMonthOverview = new MonthOverView(this._id_now, accounts); // accounts are passed after registering
      await this.db.put(firstMonthOverview);
    } catch (error) {
      console.log('problem with adding first montoverview', error);
    }
  }

  // todo: refactor
  public async createNewMonthOverview(_id_month) {
    try {
      //let _id_previousMonth = moment(this._id_now).subtract(1, 'M').format('YYYY-MM');
      let _id_previousMonth = moment(_id_month).subtract(1, 'M').format('YYYY-MM');
      let doc = await this.db.get(_id_previousMonth);
      doc.accounts.forEach(acc => {
        acc.initialBalance = acc.finalBalance;
      });
      // a get without a put --> dont need to make a copy, just dont put it back in.
      let newMonthOverview = new MonthOverView(_id_month, doc.accounts, doc.categories, undefined, doc.usedTags);
      newMonthOverview.clearExpensesFromCategories();
      newMonthOverview.clearTransactionsFromAccounts();
      newMonthOverview.clearCurrentAmountSpentInBudget();
      await this.db.put(newMonthOverview);
      return newMonthOverview; // dont always need a return
      // any gotchas? think about it 
    } catch (error) {
      console.log('error in creating a new month overview', error);
    }
  }

  // TODO: update to current month when finished
  public async getMonthOverview(_id_month: string): Promise < MonthOverView > {
    return this.getMonthOverviewObject(_id_month);
  }

  private async getMonthOverviewObject(_id_month: string): Promise < MonthOverView > {

    try {
      let doc = await this.db.get(_id_month);
      console.log(_id_month);
      return new MonthOverView(doc._id, doc.accounts, doc.categories, doc._rev, doc.usedTags);
    } catch (error) {
      if (error.name === 'not_found') {
        await this.initializeMinAndMaxDate();
        return this.createNewMonthOverview(_id_month); 
        
      }
    }
  }


  private addTransactionBetweenAccounts(accountA: Account, operationA: string, accountB: Account, operationB: string, amount: number, transactionDate ? : string) {
    accountA.addTransaction(new Transaction(amount, accountA.getAccountName(), accountB.getAccountName(), operationA, transactionDate));
    accountB.addTransaction(new Transaction(amount, accountA.getAccountName(), accountB.getAccountName(), operationB, transactionDate));
  }

  private updateFinalBalancesBetweenAccounts(accountA: Account, operationA: string, accountB: Account, operationB: string, amount: number) {
    // from a to b
    accountA.updateFinalBalance(operationA, amount); // decrease
    accountB.updateFinalBalance(operationB, amount); // increase
  }

  private updateFinalAndInitialBalancesBetweenAccounts(accountA: Account, operationA: string, accountB: Account, operationB: string, amount: number) {
    accountA.updateInitialBalance(operationA, amount); // decrease
    accountA.updateFinalBalance(operationA, amount);
    accountB.updateInitialBalance(operationB, amount);
    accountB.updateFinalBalance(operationB, amount);
  }



  // private updateFinalBalanceRecievingAccount(recievingAccount: Account, amount: number) {
  //   recievingAccount.updateFinalBalance('increase', amount);
  // }

  // private updateFinalBalanceSendingAccount(sendingAccount: Account, amount: number) {
  //   sendingAccount.updateFinalBalance('decrease', amount);
  // }

  private updateFinalBalanceAccount(account: Account, amount: number, operation: string)
  {
    account.updateFinalBalance(operation, amount);
  }

  private updateInitialBalanceAccount(account: Account, amount: number, operation: string)
  {
    account.updateInitialBalance(operation, amount);
  }

  private async transferFromExternalAccount(_id_month: string, accountHolderName: string, recievingAccountName: string, amount: number, transactionDate ? : string) {
    try {
      let monthOverview = await this.getMonthOverviewObject(_id_month);
      let recievingAccount = monthOverview.getAccByName(recievingAccountName);
      this.updateFinalBalanceAccount(recievingAccount, amount, 'increase');
      recievingAccount.addTransaction(new Transaction(amount, accountHolderName, recievingAccount.getAccountName(), 'increase', transactionDate));
      await this.db.put(monthOverview);
    } catch (error) {
      console.log('error in transferring funds between external accounts', error);
    }
  }


  public async transferBetweenOwnAccounts(_id_month: string, accountNameA: string, accountNameB: string, amount: number, transactionDate ? : string) {
    try {
      let monthOverview = await this.getMonthOverviewObject(_id_month);
      let accountA = monthOverview.getAccByName(accountNameA);
      let accountB = monthOverview.getAccByName(accountNameB);
      this.updateFinalBalancesBetweenAccounts(accountA, 'decrease', accountB, 'increase', amount);
      this.addTransactionBetweenAccounts(accountA, 'decrease', accountB, 'increase', amount, transactionDate);
      await this.db.put(monthOverview);
    } catch (error) {
      console.log('error in transferring funds between accounts', error);
    }
  }

  private async updateBalanceInFollowingMonthsAfterTransfer(_id_month: string, accountNameA: string, accountNameB: string, amount: number) {
    var _id_monthPlusAmonth = moment(_id_month).add(1, 'M').format('YYYY-MM');
    var nowPlusAmonth = moment(this._id_now).add(1, 'M').format('YYYY-MM'); // refactor in moment provider.
    while (_id_monthPlusAmonth !== nowPlusAmonth) {
      let monthOverview = await this.getMonthOverviewObject(_id_monthPlusAmonth);
      let accountA = monthOverview.getAccByName(accountNameA);
      let accountB = monthOverview.getAccByName(accountNameB);
      this.updateFinalAndInitialBalancesBetweenAccounts(accountA, 'decrease', accountB, 'increase', amount);
      await this.db.put(monthOverview, {
        latest: true,
        force: true
      });
      _id_monthPlusAmonth = moment(_id_monthPlusAmonth).add(1, 'M').format('YYYY-MM'); // refactor in moment provider.
    }

  }

  private async updateBalanceInFollowingMonthsAfterExternalTransfer(_id_month: string, accountHolderName: string, recievingAccountName: string, amount: number) {
    var _id_monthPlusAmonth = moment(_id_month).add(1, 'M').format('YYYY-MM');
    var nowPlusAmonth = moment(this._id_now).add(1, 'M').format('YYYY-MM'); // refactor in moment provider.
    while (_id_monthPlusAmonth !== nowPlusAmonth) {
      let monthOverview = await this.getMonthOverviewObject(_id_monthPlusAmonth);
      let recievingAccount = monthOverview.getAccByName(recievingAccountName);
      this.updateFinalBalanceAccount(recievingAccount, amount, 'increase');
      await this.db.put(monthOverview, {
        latest: true,
        force: true
      });
      _id_monthPlusAmonth = moment(_id_monthPlusAmonth).add(1, 'M').format('YYYY-MM'); // refactor in moment provider.
    }
  }




  async getRangeOfDateTimes() { // implement range for date time picker via end and start, look at docs
    try {

    } catch (error) {

    }
  }

  public async getAllAccounts() {
    // get them all with alldocs, they are sorted by date, push all accounts together
    // for every account found, push it into one object
    // push all transactions belonging to one account together

    let accountsWithAllTransactions = [];
    let allDocs = await this.db.allDocs({
      include_docs: true,
      descending: true
    });
    allDocs.rows.forEach(monthOverview => {
      if (monthOverview.doc.accounts) {
        monthOverview.doc.accounts.forEach(account => {
          if ((accountsWithAllTransactions.findIndex(acc => acc.accountName === account.accountName) === -1)) {
            accountsWithAllTransactions.push(new Account(account.owner, account.accountName, account.initialBalance, account.finalBalance, account.transactions));
          } else {
            let accountObject: Account = accountsWithAllTransactions.find(acc => acc.getAccountName() === account.accountName);
            let transactions: Transaction[] = accountObject.getTransactions();
            account.transactions.forEach(tr => {
              if ((transactions.findIndex(t => t.getUniqId() === tr.uniqId) === -1)) {
                accountObject.addTransaction(new Transaction(tr.amount, tr.sendingAccountName, tr.recievingAccountName, tr.operation, tr.transactionDate, tr.uniqId));
              }
            });

          }
        });
      }

    });

    return accountsWithAllTransactions;


  }


  private async updateBalanceInFollowingMonthsAfterExpense(_id_month: string, expense: Expense, oldAccountName?: string) {
    var _id_monthPlusAmonth = moment(_id_month).add(1, 'M').format('YYYY-MM');
    var nowPlusAmonth = moment(this._id_now).add(1, 'M').format('YYYY-MM'); // refactor in moment provider.
    while (_id_monthPlusAmonth !== nowPlusAmonth) {
      let monthOverview = await this.getMonthOverviewObject(_id_monthPlusAmonth);
      let account = monthOverview.getAccByName(expense.getUsedAccountName());
      account.updateFinalBalance('decrease', expense.getCost());
      account.updateInitialBalance('decrease', expense.getCost());
      monthOverview.addTagsToUsedTags(expense.getTags());
      if(oldAccountName)
      {
        let oldAccount = monthOverview.getAccByName(oldAccountName);
        oldAccount.updateFinalBalance('increase', expense.getCost());
        account.updateInitialBalance('increase', expense.getCost());
      }
      await this.db.put(monthOverview, {
        latest: true,
        force: true
      }); // MAYBE SYNC MANUALLY....
      _id_monthPlusAmonth = moment(_id_monthPlusAmonth).add(1, 'M').format('YYYY-MM'); // refactor in moment provider.
    }
  }

    // REFACTOR 
  // seperate category and expenses? extra db call but now its a mess...
  private async addExpenseToCategoryToMonthOverview(_id_month: string, categoryName: string, expense: Expense) {
    let monthOverview = await this.getMonthOverviewObject(_id_month);
    let account = monthOverview.getAccByName(expense.getUsedAccountName());
    account.updateFinalBalance('decrease', expense.getCost());  // --> 2 times??
    let category = monthOverview.getCategoryByName(categoryName);
    category.addExpense(expense);
    let budget = category.getBudget();
    budget.addToAmountSpentInBudget(expense.getCost()); // always add to amountspent --> when a user decides to add a budget to this category, it will already be tracked 
    monthOverview.addTagsToUsedTags(expense.getTags());
    await this.db.put(monthOverview);
  }



  public async addExpenseToCategory(_id_month: string, categoryName: string, expense: Expense) {
    try {
      this.addExpenseToCategoryToMonthOverview(_id_month, categoryName, expense);
      if (_id_month !== this._id_now) {
        console.log('updating balances in following months');
        this.updateBalanceInFollowingMonthsAfterExpense(_id_month, expense);
      }

    } catch (error) {
      console.log('error in adding expenses', error);
    }

  }

  public async addTransfer(_id_month: string, accountNameA: string, accountNameB: string, amount: number, transactionDate: string) {
    try {
      this.transferBetweenOwnAccounts(_id_month, accountNameA, accountNameB, amount, transactionDate);
      if (_id_month !== this._id_now) {
        this.updateBalanceInFollowingMonthsAfterTransfer(_id_month, accountNameA, accountNameB, amount);
        console.log('updating balances in following months after a transfer');
      }
    } catch (error) {
      console.log(error);

    }
  }

  public async addTransferFromExternalAccount(_id_month: string, accountHolderName: string, recievingAccountName: string, amount: number, transactionDate: string) {
    try {
      await this.transferFromExternalAccount(_id_month, accountHolderName, recievingAccountName, amount, transactionDate);
      if (_id_month !== this._id_now) {
        this.updateBalanceInFollowingMonthsAfterExternalTransfer(_id_month, accountHolderName, recievingAccountName, amount);
        console.log('updating balances in following months after an external transfer');
      }
    } catch (error) {
      console.log('error in updating balances in following months after external transfer');
    }
  }



  public async updateCategoryAndExpensesIconName(categoryName: string, iconName: string) {

    let newDocs: MonthOverView[] = [];
    let allDocs = await this.db.allDocs({
      include_docs: true
    });
    allDocs.rows.forEach(mo => {
      let monthOverviewObJect = new MonthOverView(mo.doc._id, mo.doc.accounts, mo.doc.categories, mo.doc._rev, mo.doc.usedTags);
      if (monthOverviewObJect.containsCategory(categoryName)) {
        let category: Category = monthOverviewObJect.getCategoryByName(categoryName);
        let expenses: Expense[] = category.getExpenses();
        category.setIconName(iconName);
        expenses.forEach(e => e.setIconName(iconName));
      }
      newDocs.push(monthOverviewObJect);
    });
    await this.db.bulkDocs({docs: newDocs});
  }

  public async updateCategoryColor(categoryName: string, newColor: string) {
    let newDocs = [];
    let allDocs = await this.db.allDocs({
      include_docs: true
    });
    allDocs.rows.forEach(mo => {
      
        let monthOverviewObJect = new MonthOverView(mo.doc._id, mo.doc.accounts, mo.doc.categories, mo.doc._rev, mo.doc.usedTags);
        if (monthOverviewObJect.containsCategory(categoryName)) {
          monthOverviewObJect.getCategoryByName(categoryName).setCategoryColor(newColor);
        }
        newDocs.push(monthOverviewObJect);
      
      
    });
    await this.db.bulkDocs({docs: newDocs});
  }

  public async updateCategoryName(categoryName: string, newCategoryName: string) {
    let newDocs = [];
    let allDocs = await this.db.allDocs({
      include_docs: true
    });
    allDocs.rows.forEach(mo => {
      
        let monthOverviewObJect = new MonthOverView(mo.doc._id, mo.doc.accounts, mo.doc.categories, mo.doc._rev, mo.doc.usedTags);
      if (monthOverviewObJect.containsCategory(categoryName)) {
        monthOverviewObJect.getCategoryByName(categoryName).setCategoryName(newCategoryName);
      }
      newDocs.push(monthOverviewObJect);
      }
      
      
    );
    await this.db.bulkDocs({docs: newDocs});

  }

  async getMinDate() {
    let allDocs = await this.db.allDocs();
    return allDocs.rows[0].id || this.momentProvider.getCurrentYearAndMonth();
  }

  async getMaxDate() {
    let allDocs = await this.db.allDocs();
    return allDocs.rows[allDocs.rows.length -1].id || this.momentProvider.getCurrentYearAndMonth();
  }


}
