import { MomentProvider } from './../moment/moment';
import { MonthOverviewProvider } from './../month-overview/month-overview';
import {
  CategoryProvider
} from './../category/category';
import {
  Dataset
} from './../../models/Dataset';
import {
  Category
} from './../../models/Category';
import {
  Expense
} from './../../models/Expense';

import {
  Injectable
} from '@angular/core';
import * as Chart from 'chart.js';
import randomColor from 'randomcolor'
import {
  Events
} from 'ionic-angular';
import { Tag } from '../../models/Tag';

/*
  Generated class for the ChartProvider provider.

  See https://angular.io/guide/dependency-injection for more info on providers
  and Angular DI.
*/
@Injectable()
export class ChartProvider {

  private chartInstance: any; // holds the chartjs instance
  private labels: string []; // kept here for setup reasons --> chart constructor needs labels before instantiation
  private labelType: string; // selected labelType --> determines the labels 
  private dataType: string; // data on which operations are executed --> category etc..., needs to be the same for each dataset


  constructor(public events: Events, public categoryProvider: CategoryProvider, public momentProvider: MomentProvider) {}

  createNewChart(ctx: any, dataset?: Dataset, type ? : string, expense ? : boolean, customLegend ? : boolean, customLabels?: string []) {
    let chartData = {
      datasets: [{
        data: dataset.data || [],
        backgroundColor: dataset.backgroundColor || []
      }],
      labels: customLabels || this.getLabels() // customlabels are for use in other components other than chartoverview
    };
    let chart = new Chart(ctx, {
      type: type || 'bar',
      data: chartData,
      options: {
        events: ["mousemove", "mouseout", "click", "touchstart", "touchmove", "touchend"],
        onClick: (evt, item) => {
          //evt.stopImmediatePropagation();
          //2x events fired 
          // touchend + click --> stilll need touchend?
          if (item.length > 0 && expense) {
            this.events.publish('expense:clicked', item[0]._index);
          }
        },
        legend: {
          display: false
        },
        scales: {
          yAxes: [{
              ticks: {
                  beginAtZero: (type === 'bar')
              },
              display: (type === 'bar')
          }]
      }},
    });
    if(!customLabels) {
      this.chartInstance = chart; // other charts other than the one on the mainpage are not referenced by this service
    }
    return chart;
  }

  public setLabelType(labelType: string ): void {
    this.labelType = labelType;
  }

  public setDataType(dataType: string): void {
    this.dataType = dataType;
  }

  public getLabelType(): string {
    return this.labelType;
  }

  public getDataType(): string {
    return this.dataType;
  }

  // only used once for the default instance, do not reuse, use appropiate setchartlabels and getter
  public getLabels(): string [] {
    return this.labels;
  }

  public addDataset(dataset: Dataset): void {
    this.chartInstance.data.datasets.push(dataset);
    this.chartInstance.update();
  }

  // setup first chart when landing on the chart overview page 
  public async setupDefaultChart(ctx): Promise<void> {
    let emptyDataset = new Dataset([], []);
    this.createNewChart(ctx, emptyDataset);
    this.clearDatasets();
    let currentYearAndMonth = this.momentProvider.getCurrentYearAndMonth();
    let categories = await this.categoryProvider.getCategories(currentYearAndMonth);
    let filteredCategories = categories.filter(c => c.getTotalExpenseCost() > 0);
    let timeperiod = {from: currentYearAndMonth, to: currentYearAndMonth};
    let labelType = 'category'; // get from default settings in useroverview 
    
    let labels = filteredCategories.map(c => c.getCategoryName());
    
    let dataType = 'category'; // get from default settings in useroverview 
    

    let operationType = 'total'; // get from default settings in useroverview 

    this.setLabelType(labelType);
    this.setDataType(dataType);
    this.setChartLabels(labels);

    let data = await this.getDatasetData(timeperiod,undefined,  labelType, dataType, operationType, filteredCategories);
    let backgroundColor = filteredCategories.map(c => c.getCategoryColor());
    let dataObject = new Dataset(data,backgroundColor);
    this.addDataset(dataObject);
  }


  async handleNewDataset(operationType: string, timeperiod: {
    from: string,
    to: string
  }, categories?: Category [], tags?: Tag [])
  {
    if(categories)
    {
      if(this.dataType === 'category' && this.labelType === 'category')
      {
        let data =  await this.categoryProvider.getCategoryDatasetWithCategoryLabel(timeperiod.from, timeperiod.to, categories, operationType)
        let backgroundColor = categories.map(c => c.getCategoryColor());
        let dataset = new Dataset(data, backgroundColor);
        let labels = categories.map(c => c.getCategoryName());
        this.setChartLabels(labels);
        this.addDataset(dataset);
      }
      
    }
    else if(tags)
    {
      // and so on
    }
  } 


  // refactor 
  public getDatasetData(timeperiod: {
    from: string,
    to: string
  }, categoryName: string, labelType: string, dataType: string, operationType: string, categories?: Category []) {
    if (dataType === 'category' && labelType === 'month') {
      return this.categoryProvider.getCategoryDatasetWithMonthLabel(timeperiod.from, timeperiod.to, labelType, categoryName, operationType)
    }
    else if(dataType === 'category' && labelType === 'category')
    {
      return this.categoryProvider.getCategoryDatasetWithCategoryLabel(timeperiod.from, timeperiod.to, categories, operationType)
    } 
  }


  public getDatasets(): any {
    return this.chartInstance.data.datasets
  }

  public clearDatasets(): void {
    this.chartInstance.data.datasets = [];
    this.chartInstance.update();
  }

  public getChartInstance(): any {
    return this.chartInstance;
  }

  public getChartLabels(): string[] {
    return this.chartInstance.data.labels;
  }

  public setChartLabels(labels: string[]) {
    this.chartInstance.data.labels = labels;
    this.chartInstance.update();
  }

  public setType(type: string) {
    this.chartInstance.type = type;
    this.chartInstance.update();
  }

  


  buildRandomColors(amount: number) {
    let colors = [];
    for (let i = 0; i <= amount; i++) {
      colors.push(randomColor());
    }
    return colors;
  }

  buildExpenseData(expenses: Expense[]) {
    return expenses.map(e => e.getCost());
  }

  buildExpenseLabels(expenses: Expense[]) {
    return expenses.map(e => e.getDescription())
  }


  buildCategoryData(categories: Category[]): number[] {
    let totalCategoryCosts = [];
    categories.forEach(c => totalCategoryCosts.push(c.getTotalExpenseCost()));
    return totalCategoryCosts;
  }

  buildCategoryLabels(categories: Category[]): string[] {
    return categories.map(c => c.getCategoryName());
  }

  buildCategoryColors(categories: Category[]): string[] {
    return categories.map(c => c.getCategoryColor());
  }

  buildIconLegend(categories: Category[]) {
    let icons = categories.map(c => c.getIconName())
  }

  private buildIconHTMLForComplexLegend(iconName: string) {
    return `<ion-icon name="${iconName}" class="icon icon-md ion-md-${iconName} item-icon legend"></ion-icon>`;
  }

  public buildCategoryLegendHTML(categories: Category[]) {
    let html = `<ul>`;
    categories.forEach(c => {
      if (c.getTotalExpenseCost() > 0) {
        html += `<li> <span style="background-color:${c.getCategoryColor()}">`
        html += this.buildIconHTMLForComplexLegend(c.getIconName());
        html += `</span>`
        html += '</li>'
      }
    });
    html += `</ul>`
    return html;
  }






}
