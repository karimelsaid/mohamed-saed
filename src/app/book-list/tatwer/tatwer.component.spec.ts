import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TatwerComponent } from './tatwer.component';

describe('TatwerComponent', () => {
  let component: TatwerComponent;
  let fixture: ComponentFixture<TatwerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TatwerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TatwerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
